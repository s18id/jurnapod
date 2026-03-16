// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { DatabaseConnection } from "../core/backoffice-data-service.js";

export interface BatchJob {
  id: string;
  company_id: number;
  job_type: 'SALES_REPORT' | 'AUDIT_CLEANUP' | 'RECONCILIATION' | 'ANALYTICS_SYNC';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  payload: Record<string, any>;
  scheduled_at: Date;
  max_retries: number;
  retry_count: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error_message?: string;
}

export interface BatchProcessorConfig {
  maxConcurrentJobs: number;
  pollIntervalMs: number;
  retryDelayMs: number;
  cleanupIntervalMs: number;
}

export class BatchProcessor {
  private isRunning = false;
  private processingJobs = new Set<string>();
  private pollTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private db: DatabaseConnection,
    private config: BatchProcessorConfig = {
      maxConcurrentJobs: 3,
      pollIntervalMs: 30_000, // 30 seconds
      retryDelayMs: 60_000,   // 1 minute
      cleanupIntervalMs: 300_000 // 5 minutes
    }
  ) {}

  /**
   * Start the batch processor
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Starting batch processor...');

    // Initialize batch processing table if needed
    await this.initializeBatchTable();

    // Start polling for jobs
    this.pollTimer = setInterval(() => {
      this.processJobs().catch(error => {
        console.error('Batch processor error:', error);
      });
    }, this.config.pollIntervalMs);

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupCompletedJobs().catch(error => {
        console.error('Batch cleanup error:', error);
      });
    }, this.config.cleanupIntervalMs);

    // Process any pending jobs immediately
    await this.processJobs();
  }

  /**
   * Stop the batch processor
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Wait for current jobs to finish
    while (this.processingJobs.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Batch processor stopped');
  }

  /**
   * Queue a new batch job
   */
  async queueJob(job: Omit<BatchJob, 'id' | 'retry_count' | 'status'>): Promise<string> {
    const jobId = crypto.randomUUID();
    
    await this.db.query(`
      INSERT INTO backoffice_sync_queue (
        id, company_id, document_type, tier, sync_status, 
        scheduled_at, retry_count, max_retries, payload_hash
      ) VALUES (?, ?, ?, 'ANALYTICS', 'PENDING', ?, 0, ?, ?)
    `, [
      jobId,
      job.company_id,
      job.job_type,
      job.scheduled_at.toISOString(),
      job.max_retries,
      JSON.stringify(job.payload)
    ]);

    return jobId;
  }

  /**
   * Process pending jobs
   */
  private async processJobs(): Promise<void> {
    if (!this.isRunning) return;

    const availableSlots = this.config.maxConcurrentJobs - this.processingJobs.size;
    if (availableSlots <= 0) return;

    // Get pending jobs
    const pendingJobs = await this.db.query(`
      SELECT 
        id,
        company_id,
        document_type as job_type,
        scheduled_at,
        retry_count,
        max_retries,
        payload_hash as payload
      FROM backoffice_sync_queue
      WHERE sync_status = 'PENDING'
        AND scheduled_at <= NOW()
        AND retry_count < max_retries
      ORDER BY scheduled_at ASC
      LIMIT ?
    `, [availableSlots]);

    for (const jobData of pendingJobs) {
      if (!this.isRunning) break;
      
      const job: BatchJob = {
        id: jobData.id,
        company_id: jobData.company_id,
        job_type: jobData.job_type,
        priority: 'MEDIUM', // Default priority
        payload: JSON.parse(jobData.payload || '{}'),
        scheduled_at: new Date(jobData.scheduled_at),
        max_retries: jobData.max_retries,
        retry_count: jobData.retry_count,
        status: 'PENDING'
      };

      // Process job async
      this.processJob(job);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: BatchJob): Promise<void> {
    this.processingJobs.add(job.id);

    try {
      // Mark job as processing
      await this.db.query(`
        UPDATE backoffice_sync_queue 
        SET sync_status = 'PROCESSING', processing_started_at = NOW()
        WHERE id = ?
      `, [job.id]);

      // Execute the job based on type
      await this.executeJob(job);

      // Mark as completed
      await this.db.query(`
        UPDATE backoffice_sync_queue 
        SET sync_status = 'SUCCESS', processed_at = NOW()
        WHERE id = ?
      `, [job.id]);

      console.log(`Batch job ${job.id} (${job.job_type}) completed successfully`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Increment retry count and potentially reschedule
      const nextRetry = job.retry_count + 1;
      if (nextRetry < job.max_retries) {
        const nextScheduled = new Date(Date.now() + this.config.retryDelayMs);
        
        await this.db.query(`
          UPDATE backoffice_sync_queue 
          SET sync_status = 'PENDING', 
              retry_count = ?,
              error_message = ?,
              scheduled_at = ?
          WHERE id = ?
        `, [nextRetry, errorMessage, nextScheduled.toISOString(), job.id]);

        console.log(`Batch job ${job.id} failed, retry ${nextRetry}/${job.max_retries} scheduled`);
      } else {
        // Mark as permanently failed
        await this.db.query(`
          UPDATE backoffice_sync_queue 
          SET sync_status = 'FAILED', 
              error_message = ?,
              processed_at = NOW()
          WHERE id = ?
        `, [errorMessage, job.id]);

        console.error(`Batch job ${job.id} (${job.job_type}) permanently failed:`, errorMessage);
      }
    } finally {
      this.processingJobs.delete(job.id);
    }
  }

  /**
   * Execute a specific job based on its type
   */
  private async executeJob(job: BatchJob): Promise<void> {
    switch (job.job_type) {
      case 'SALES_REPORT':
        await this.generateSalesReport(job);
        break;
      case 'AUDIT_CLEANUP':
        await this.cleanupAuditLogs(job);
        break;
      case 'RECONCILIATION':
        await this.performReconciliation(job);
        break;
      case 'ANALYTICS_SYNC':
        await this.syncAnalyticsData(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.job_type}`);
    }
  }

  /**
   * Generate sales report
   */
  private async generateSalesReport(job: BatchJob): Promise<void> {
    console.log(`Generating sales report for company ${job.company_id}`);
    
    // TODO: Implement actual sales report generation
    // This would generate comprehensive sales analytics and store them
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Cleanup old audit logs
   */
  private async cleanupAuditLogs(job: BatchJob): Promise<void> {
    const retentionDays = job.payload.retentionDays || 365;
    
    const result = await this.db.query(`
      DELETE FROM audit_logs 
      WHERE company_id = ? 
        AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [job.company_id, retentionDays]);

    console.log(`Cleaned up ${(result as any).affectedRows} old audit log entries`);
  }

  /**
   * Perform reconciliation
   */
  private async performReconciliation(job: BatchJob): Promise<void> {
    console.log(`Performing reconciliation for company ${job.company_id}`);
    
    // TODO: Implement actual reconciliation logic
    // This would reconcile payments, inventory, etc.
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Sync analytics data
   */
  private async syncAnalyticsData(job: BatchJob): Promise<void> {
    console.log(`Syncing analytics data for company ${job.company_id}`);
    
    // TODO: Implement analytics data aggregation
    // This would compute and store analytics aggregations
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  /**
   * Initialize batch processing table
   */
  private async initializeBatchTable(): Promise<void> {
    // The table is already created by migration 0106
    // Just ensure proper indexes exist
    try {
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_backoffice_sync_processing 
        ON backoffice_sync_queue (sync_status, scheduled_at)
      `);
    } catch (error) {
      // Index may already exist
    }
  }

  /**
   * Cleanup completed jobs older than 7 days
   */
  private async cleanupCompletedJobs(): Promise<void> {
    try {
      const result = await this.db.query(`
        DELETE FROM backoffice_sync_queue
        WHERE sync_status IN ('SUCCESS', 'FAILED')
          AND processed_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
      `);

      const deletedCount = (result as any).affectedRows || 0;
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} completed batch jobs`);
      }
    } catch (error) {
      console.error('Failed to cleanup completed jobs:', error);
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<BatchJob | null> {
    const result = await this.db.querySingle(`
      SELECT 
        id,
        company_id,
        document_type as job_type,
        scheduled_at,
        retry_count,
        max_retries,
        sync_status as status,
        error_message,
        payload_hash as payload
      FROM backoffice_sync_queue
      WHERE id = ?
    `, [jobId]);

    if (!result) return null;

    return {
      id: result.id,
      company_id: result.company_id,
      job_type: result.job_type,
      priority: 'MEDIUM',
      payload: JSON.parse(result.payload || '{}'),
      scheduled_at: new Date(result.scheduled_at),
      max_retries: result.max_retries,
      retry_count: result.retry_count,
      status: result.status,
      error_message: result.error_message
    };
  }
}