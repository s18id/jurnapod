// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { DbConn } from "@jurnapod/db";

export interface BatchJob {
  id: string;
  company_id: number;
  job_type: 'SALES_REPORT' | 'AUDIT_CLEANUP' | 'RECONCILIATION' | 'ANALYTICS_SYNC' | 'SCHEDULED_EXPORT' | 'FORECAST_GENERATION' | 'INSIGHTS_CALCULATION';
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
    private db: DbConn,
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
      case 'SCHEDULED_EXPORT':
        await this.processScheduledExport(job);
        break;
      case 'FORECAST_GENERATION':
        await this.generateForecast(job);
        break;
      case 'INSIGHTS_CALCULATION':
        await this.calculateInsights(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.job_type}`);
    }
  }

  /**
   * Generate sales report
   */
  private async generateSalesReport(job: BatchJob): Promise<void> {
    const companyId = job.company_id;
    const payload = job.payload || {};
    const reportType = payload.reportType || 'daily'; // daily, weekly, monthly
    const startDate = payload.startDate ? new Date(payload.startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = payload.endDate ? new Date(payload.endDate) : new Date();
    
    console.log(`Generating ${reportType} sales report for company ${companyId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Query sales summary
    const summaryResult = await this.db.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(COALESCE(p.paid_total, 0)), 0) as total_sales,
        COALESCE(SUM(COALESCE(i.gross_total, 0)), 0) as gross_sales,
        COALESCE(SUM(COALESCE(p.paid_total, 0) - COALESCE(i.gross_total, 0)), 0) as tax_total,
        COUNT(DISTINCT pt.outlet_id) as outlet_count,
        COUNT(DISTINCT pt.user_id) as staff_count
      FROM pos_transactions pt
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(amount) as paid_total
        FROM pos_transaction_payments
        GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(qty * price_snapshot) as gross_total
        FROM pos_transaction_items
        GROUP BY pos_transaction_id
      ) i ON i.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.trx_at < ?
        AND pt.status = 'COMPLETED'
    `, [companyId, startDate.toISOString(), endDate.toISOString()]);

    const summary = summaryResult[0] || {
      total_transactions: 0,
      total_sales: 0,
      gross_sales: 0,
      tax_total: 0,
      outlet_count: 0,
      staff_count: 0
    };

    // Query daily breakdown
    const dailyResult = await this.db.query(`
      SELECT 
        DATE(pt.trx_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(COALESCE(p.paid_total, 0)), 0) as daily_sales
      FROM pos_transactions pt
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(amount) as paid_total
        FROM pos_transaction_payments
        GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.trx_at < ?
        AND pt.status = 'COMPLETED'
      GROUP BY DATE(pt.trx_at)
      ORDER BY date DESC
    `, [companyId, startDate.toISOString(), endDate.toISOString()]);

    // Query top items
    const topItemsResult = await this.db.query(`
      SELECT 
        pti.item_name,
        pti.price_snapshot,
        SUM(pti.qty) as total_qty,
        SUM(pti.qty * pti.price_snapshot) as total_sales
      FROM pos_transaction_items pti
      INNER JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.trx_at < ?
        AND pt.status = 'COMPLETED'
      GROUP BY pti.item_name, pti.price_snapshot
      ORDER BY total_sales DESC
      LIMIT 10
    `, [companyId, startDate.toISOString(), endDate.toISOString()]);

    // Query outlet breakdown
    const outletResult = await this.db.query(`
      SELECT 
        pt.outlet_id,
        o.name as outlet_name,
        COUNT(*) as transaction_count,
        COALESCE(SUM(COALESCE(p.paid_total, 0)), 0) as total_sales
      FROM pos_transactions pt
      LEFT JOIN outlets o ON o.id = pt.outlet_id AND o.company_id = pt.company_id
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(amount) as paid_total
        FROM pos_transaction_payments
        GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.trx_at < ?
        AND pt.status = 'COMPLETED'
      GROUP BY pt.outlet_id, o.name
      ORDER BY total_sales DESC
    `, [companyId, startDate.toISOString(), endDate.toISOString()]);

    // Store results
    const reportResult = {
      report_type: reportType,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      summary: {
        total_transactions: Number(summary.total_transactions) || 0,
        total_sales: Number(summary.total_sales) || 0,
        gross_sales: Number(summary.gross_sales) || 0,
        tax_total: Number(summary.tax_total) || 0,
        outlet_count: Number(summary.outlet_count) || 0,
        staff_count: Number(summary.staff_count) || 0,
        average_transaction: summary.total_transactions > 0 
          ? Number(summary.total_sales) / Number(summary.total_transactions) 
          : 0
      },
      daily_breakdown: (dailyResult || []).map((d: any) => ({
        date: d.date,
        transaction_count: Number(d.transaction_count) || 0,
        daily_sales: Number(d.daily_sales) || 0
      })),
      top_items: (topItemsResult || []).map((i: any) => ({
        item_name: i.item_name,
        price: Number(i.price_snapshot) || 0,
        quantity_sold: Number(i.total_qty) || 0,
        total_sales: Number(i.total_sales) || 0
      })),
      outlet_breakdown: (outletResult || []).map((o: any) => ({
        outlet_id: o.outlet_id,
        outlet_name: o.outlet_name || 'Unknown',
        transaction_count: Number(o.transaction_count) || 0,
        total_sales: Number(o.total_sales) || 0
      })),
      generated_at: new Date().toISOString()
    };

    // Update job with result
    await this.db.query(`
      UPDATE backoffice_sync_queue 
      SET result_hash = ?
      WHERE id = ?
    `, [JSON.stringify(reportResult), job.id]);

    console.log(`Sales report generated for company ${companyId}: ${summary.total_transactions} transactions, $${summary.total_sales} total sales`);
  }

  /**
   * Cleanup old audit logs with archiving and compliance
   */
  private async cleanupAuditLogs(job: BatchJob): Promise<void> {
    const companyId = job.company_id;
    const payload = job.payload || {};
    const retentionDays = payload.retentionDays || 365;
    const archiveBeforeDelete = payload.archiveBeforeDelete !== false; // Default true
    
    console.log(`Starting audit log cleanup for company ${companyId}, retention: ${retentionDays} days, archive: ${archiveBeforeDelete}`);
    
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoffDate.toISOString().slice(0, 19).replace('T', ' ');
    
    // Get count before cleanup
    const countResult = await this.db.query(`
      SELECT COUNT(*) as count FROM audit_logs 
      WHERE company_id = ? AND created_at < ?
    `, [companyId, cutoffStr]);
    
    const logsToProcess = (countResult[0] as any)?.count || 0;
    
    if (logsToProcess === 0) {
      console.log(`No audit logs to clean up for company ${companyId}`);
      
      await this.db.query(`
        UPDATE backoffice_sync_queue 
        SET result_hash = ?
        WHERE id = ?
      `, [JSON.stringify({ message: 'No logs to clean up', logs_processed: 0 }), job.id]);
      
      return;
    }
    
    let archivedCount = 0;
    let deletedCount = 0;
    
    // Archive logs if enabled (archive table may not exist, handle gracefully)
    if (archiveBeforeDelete) {
      try {
        // Try to archive first (if archive table exists)
        const archiveResult = await this.db.query(`
          INSERT INTO audit_logs_archive (company_id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          SELECT company_id, user_id, action, entity_type, entity_id, details, ip_address, created_at
          FROM audit_logs 
          WHERE company_id = ? AND created_at < ?
        `, [companyId, cutoffStr]);
        
        archivedCount = (archiveResult as any)?.affectedRows || 0;
        console.log(`Archived ${archivedCount} audit log entries for company ${companyId}`);
      } catch (error) {
        console.log(`Archive table not available, skipping archive step: ${(error as Error).message}`);
      }
    }
    
    // Delete logs after archiving
    const deleteResult = await this.db.query(`
      DELETE FROM audit_logs 
      WHERE company_id = ? AND created_at < ?
    `, [companyId, cutoffStr]);
    
    deletedCount = (deleteResult as any)?.affectedRows || 0;
    console.log(`Deleted ${deletedCount} audit log entries for company ${companyId}`);
    
    // Store result summary
    const cleanupResult = {
      retention_days: retentionDays,
      cutoff_date: cutoffStr,
      logs_processed: logsToProcess,
      archived_count: archivedCount,
      deleted_count: deletedCount,
      archive_enabled: archiveBeforeDelete,
      completed_at: new Date().toISOString()
    };
    
    await this.db.query(`
      UPDATE backoffice_sync_queue 
      SET result_hash = ?
      WHERE id = ?
    `, [JSON.stringify(cleanupResult), job.id]);
    
    console.log(`Audit log cleanup completed for company ${companyId}: ${deletedCount} deleted`);
  }

  /**
   * Perform reconciliation: payments, inventory, and journal validation
   */
  private async performReconciliation(job: BatchJob): Promise<void> {
    const companyId = job.company_id;
    const payload = job.payload || {};
    const reconciliationTypes = payload.types || ['payment', 'inventory', 'journal'];
    const startDate = payload.startDate ? new Date(payload.startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = payload.endDate ? new Date(payload.endDate) : new Date();
    
    console.log(`Starting reconciliation for company ${companyId}, types: ${reconciliationTypes.join(', ')}`);
    
    const results: any = {
      started_at: new Date().toISOString(),
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      checks: {}
    };
    
    // 1. Payment Reconciliation
    if (reconciliationTypes.includes('payment')) {
      console.log(`Running payment reconciliation for company ${companyId}`);
      
      const paymentResult = await this.db.query(`
        SELECT 
          pt.id as transaction_id,
          pt.client_tx_id,
          pt.outlet_id,
          pt.trx_at,
          COALESCE(i.gross_total, 0) as transaction_total,
          COALESCE(p.paid_total, 0) as payment_total,
          COALESCE(i.gross_total, 0) - COALESCE(p.paid_total, 0) as variance
        FROM pos_transactions pt
        LEFT JOIN (
          SELECT pos_transaction_id, SUM(qty * price_snapshot) as gross_total
          FROM pos_transaction_items
          GROUP BY pos_transaction_id
        ) i ON i.pos_transaction_id = pt.id
        LEFT JOIN (
          SELECT pos_transaction_id, SUM(amount) as paid_total
          FROM pos_transaction_payments
          GROUP BY pos_transaction_id
        ) p ON p.pos_transaction_id = pt.id
        WHERE pt.company_id = ?
          AND pt.trx_at >= ?
          AND pt.trx_at < ?
          AND pt.status = 'COMPLETED'
          AND (COALESCE(i.gross_total, 0) - COALESCE(p.paid_total, 0)) != 0
        ORDER BY ABS(COALESCE(i.gross_total, 0) - COALESCE(p.paid_total, 0)) DESC
        LIMIT 50
      `, [companyId, startDate.toISOString(), endDate.toISOString()]);
      
      const paymentIssues = (paymentResult || []).map((r: any) => ({
        transaction_id: r.transaction_id,
        client_tx_id: r.client_tx_id,
        outlet_id: r.outlet_id,
        transaction_total: Number(r.transaction_total),
        payment_total: Number(r.payment_total),
        variance: Number(r.variance)
      }));
      
      const totalVariance = paymentIssues.reduce((sum: number, i: any) => sum + Math.abs(i.variance), 0);
      
      results.checks.payment = {
        status: paymentIssues.length === 0 ? 'PASSED' : 'ISSUES_FOUND',
        issue_count: paymentIssues.length,
        total_variance: totalVariance,
        details: paymentIssues
      };
      
      console.log(`Payment reconciliation: ${paymentIssues.length} issues found, $${totalVariance} total variance`);
    }
    
    // 2. Inventory Reconciliation
    if (reconciliationTypes.includes('inventory')) {
      console.log(`Running inventory reconciliation for company ${companyId}`);
      
      // Check for negative stock values
      const stockResult = await this.db.query(`
        SELECT 
          mdi.id as item_id,
          mdi.code as item_code,
          mdi.name as item_name,
          mdi.outlet_id,
          o.name as outlet_name,
          mdi.quantity as current_stock,
          mdi.updated_at as last_count_date
        FROM master_data_items mdi
        INNER JOIN outlets o ON o.id = mdi.outlet_id AND o.company_id = mdi.company_id
        WHERE mdi.company_id = ?
          AND mdi.quantity < 0
        ORDER BY mdi.quantity ASC
        LIMIT 50
      `, [companyId]);
      
      const negativeStock = (stockResult || []).map((r: any) => ({
        item_id: r.item_id,
        item_code: r.item_code,
        item_name: r.item_name,
        outlet_id: r.outlet_id,
        outlet_name: r.outlet_name,
        current_stock: Number(r.current_stock)
      }));
      
      // Check for items not updated in 30+ days (potential stale data)
      const staleResult = await this.db.query(`
        SELECT 
          mdi.id as item_id,
          mdi.code as item_code,
          mdi.name as item_name,
          mdi.outlet_id,
          o.name as outlet_name,
          DATEDIFF(NOW(), mdi.updated_at) as days_since_update
        FROM master_data_items mdi
        INNER JOIN outlets o ON o.id = mdi.outlet_id AND o.company_id = mdi.company_id
        WHERE mdi.company_id = ?
          AND mdi.updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
        ORDER BY days_since_update DESC
        LIMIT 20
      `, [companyId]);
      
      const staleItems = (staleResult || []).map((r: any) => ({
        item_id: r.item_id,
        item_code: r.item_code,
        item_name: r.item_name,
        outlet_id: r.outlet_id,
        outlet_name: r.outlet_name,
        days_since_update: r.days_since_update
      }));
      
      results.checks.inventory = {
        status: negativeStock.length === 0 && staleItems.length === 0 ? 'PASSED' : 'ISSUES_FOUND',
        negative_stock_count: negativeStock.length,
        stale_items_count: staleItems.length,
        negative_stock_items: negativeStock,
        stale_items: staleItems
      };
      
      console.log(`Inventory reconciliation: ${negativeStock.length} negative stock, ${staleItems.length} stale items`);
    }
    
    // 3. Journal Validation
    if (reconciliationTypes.includes('journal')) {
      console.log(`Running journal validation for company ${companyId}`);
      
      // Check for unbalanced journal batches
      const unbalancedResult = await this.db.query(`
        SELECT 
          jb.id as batch_id,
          jb.doc_type,
          jb.posted_at,
          COALESCE(SUM(jl.debit), 0) as total_debit,
          COALESCE(SUM(jl.credit), 0) as total_credit,
          ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) as variance
        FROM journal_batches jb
        LEFT JOIN journal_lines jl ON jl.journal_batch_id = jb.id
        WHERE jb.company_id = ?
          AND jb.posted_at >= ?
          AND jb.posted_at < ?
        GROUP BY jb.id, jb.doc_type, jb.posted_at
        HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01
        ORDER BY variance DESC
        LIMIT 20
      `, [companyId, startDate.toISOString(), endDate.toISOString()]);
      
      const unbalancedBatches = (unbalancedResult || []).map((r: any) => ({
        batch_id: r.batch_id,
        doc_type: r.doc_type,
        posted_at: r.posted_at,
        total_debit: Number(r.total_debit),
        total_credit: Number(r.total_credit),
        variance: Number(r.variance)
      }));
      
      // Check for missing journal lines
      const missingLinesResult = await this.db.query(`
        SELECT jb.id as batch_id, jb.doc_type, jb.posted_at
        FROM journal_batches jb
        WHERE jb.company_id = ?
          AND jb.posted_at >= ?
          AND jb.posted_at < ?
          AND NOT EXISTS (
            SELECT 1 FROM journal_lines jl WHERE jl.journal_batch_id = jb.id
          )
        LIMIT 20
      `, [companyId, startDate.toISOString(), endDate.toISOString()]);
      
      const missingLines = (missingLinesResult || []).map((r: any) => ({
        batch_id: r.batch_id,
        doc_type: r.doc_type,
        posted_at: r.posted_at
      }));
      
      results.checks.journal = {
        status: unbalancedBatches.length === 0 && missingLines.length === 0 ? 'PASSED' : 'ISSUES_FOUND',
        unbalanced_batch_count: unbalancedBatches.length,
        missing_lines_count: missingLines.length,
        unbalanced_batches: unbalancedBatches,
        batches_without_lines: missingLines
      };
      
      console.log(`Journal validation: ${unbalancedBatches.length} unbalanced, ${missingLines.length} missing lines`);
    }
    
    results.completed_at = new Date().toISOString();
    
    // Store results
    await this.db.query(`
      UPDATE backoffice_sync_queue 
      SET result_hash = ?
      WHERE id = ?
    `, [JSON.stringify(results), job.id]);
    
    console.log(`Reconciliation completed for company ${companyId}`);
  }

  /**
   * Sync analytics data - pre-compute common analytics
   */
  private async syncAnalyticsData(job: BatchJob): Promise<void> {
    const companyId = job.company_id;
    const payload = job.payload || {};
    const metrics = payload.metrics || ['sales_trends', 'top_products', 'revenue_by_outlet', 'hourly_patterns'];
    const periodDays = payload.periodDays || 30;
    
    console.log(`Starting analytics sync for company ${companyId}, metrics: ${metrics.join(', ')}, period: ${periodDays} days`);
    
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const results: any = {
      started_at: new Date().toISOString(),
      period: {
        start: startDate.toISOString(),
        end: new Date().toISOString()
      },
      metrics: {}
    };
    
    // 1. Sales Trends (daily/weekly/monthly)
    if (metrics.includes('sales_trends')) {
      console.log(`Computing sales trends for company ${companyId}`);
      
      const dailyTrend = await this.db.query(`
        SELECT 
          DATE(pt.trx_at) as date,
          COUNT(*) as transaction_count,
          COALESCE(SUM(pp.paid_total), 0) as daily_revenue,
          COUNT(DISTINCT pt.outlet_id) as active_outlets
        FROM pos_transactions pt
        LEFT JOIN (
          SELECT pos_transaction_id, SUM(amount) as paid_total
          FROM pos_transaction_payments
          GROUP BY pos_transaction_id
        ) pp ON pp.pos_transaction_id = pt.id
        WHERE pt.company_id = ?
          AND pt.trx_at >= ?
          AND pt.status = 'COMPLETED'
        GROUP BY DATE(pt.trx_at)
        ORDER BY date DESC
        LIMIT 90
      `, [companyId, startDate.toISOString()]);
      
      // Calculate weekly aggregates
      const weeklyTrend = await this.db.query(`
        SELECT 
          YEARWEEK(pt.trx_at, 1) as week,
          DATE(MIN(pt.trx_at)) as week_start,
          COUNT(*) as transaction_count,
          COALESCE(SUM(pp.paid_total), 0) as weekly_revenue
        FROM pos_transactions pt
        LEFT JOIN (
          SELECT pos_transaction_id, SUM(amount) as paid_total
          FROM pos_transaction_payments
          GROUP BY pos_transaction_id
        ) pp ON pp.pos_transaction_id = pt.id
        WHERE pt.company_id = ?
          AND pt.trx_at >= ?
          AND pt.status = 'COMPLETED'
        GROUP BY YEARWEEK(pt.trx_at, 1)
        ORDER BY week DESC
        LIMIT 52
      `, [companyId, startDate.toISOString()]);
      
      // Calculate growth vs previous period
      const currentPeriod = dailyTrend.slice(0, Math.ceil(periodDays / 2));
      const previousPeriod = dailyTrend.slice(Math.ceil(periodDays / 2));
      
      const currentRevenue = currentPeriod.reduce((sum: number, d: any) => sum + Number(d.daily_revenue || 0), 0);
      const previousRevenue = previousPeriod.reduce((sum: number, d: any) => sum + Number(d.daily_revenue || 0), 0);
      const growthRate = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
      
      results.metrics.sales_trends = {
        daily: (dailyTrend || []).map((d: any) => ({
          date: d.date,
          transaction_count: Number(d.transaction_count) || 0,
          daily_revenue: Number(d.daily_revenue) || 0,
          active_outlets: Number(d.active_outlets) || 0
        })),
        weekly: (weeklyTrend || []).map((w: any) => ({
          week: w.week,
          week_start: w.week_start,
          transaction_count: Number(w.transaction_count) || 0,
          weekly_revenue: Number(w.weekly_revenue) || 0
        })),
        growth_rate: Math.round(growthRate * 100) / 100,
        period_comparison: {
          current_period_revenue: currentRevenue,
          previous_period_revenue: previousRevenue
        }
      };
    }
    
    // 2. Top Products
    if (metrics.includes('top_products')) {
      console.log(`Computing top products for company ${companyId}`);
      
      const topProducts = await this.db.query(`
        SELECT 
          pti.item_name,
          pti.price_snapshot as unit_price,
          SUM(pti.qty) as total_quantity,
          SUM(pti.qty * pti.price_snapshot) as total_revenue,
          COUNT(DISTINCT pti.pos_transaction_id) as order_count
        FROM pos_transaction_items pti
        INNER JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id
        WHERE pt.company_id = ?
          AND pt.trx_at >= ?
          AND pt.status = 'COMPLETED'
        GROUP BY pti.item_name, pti.price_snapshot
        ORDER BY total_revenue DESC
        LIMIT 20
      `, [companyId, startDate.toISOString()]);
      
      const totalProductRevenue = (topProducts || []).reduce((sum: number, p: any) => sum + Number(p.total_revenue || 0), 0);
      
      results.metrics.top_products = {
        items: (topProducts || []).map((p: any) => ({
          item_name: p.item_name,
          unit_price: Number(p.unit_price) || 0,
          total_quantity: Number(p.total_quantity) || 0,
          total_revenue: Number(p.total_revenue) || 0,
          order_count: Number(p.order_count) || 0,
          share_of_revenue: totalProductRevenue > 0 
            ? Math.round((Number(p.total_revenue) / totalProductRevenue) * 10000) / 100 
            : 0
        })),
        total_revenue: totalProductRevenue
      };
    }
    
    // 3. Revenue by Outlet
    if (metrics.includes('revenue_by_outlet')) {
      console.log(`Computing revenue by outlet for company ${companyId}`);
      
      const outletRevenue = await this.db.query(`
        SELECT 
          pt.outlet_id,
          o.name as outlet_name,
          COUNT(*) as transaction_count,
          COALESCE(SUM(pp.paid_total), 0) as total_revenue,
          COALESCE(AVG(pp.paid_total), 0) as average_transaction,
          COUNT(DISTINCT pt.user_id) as staff_count
        FROM pos_transactions pt
        LEFT JOIN outlets o ON o.id = pt.outlet_id AND o.company_id = pt.company_id
        LEFT JOIN (
          SELECT pos_transaction_id, SUM(amount) as paid_total
          FROM pos_transaction_payments
          GROUP BY pos_transaction_id
        ) pp ON pp.pos_transaction_id = pt.id
        WHERE pt.company_id = ?
          AND pt.trx_at >= ?
          AND pt.status = 'COMPLETED'
        GROUP BY pt.outlet_id, o.name
        ORDER BY total_revenue DESC
      `, [companyId, startDate.toISOString()]);
      
      const totalRevenue = (outletRevenue || []).reduce((sum: number, o: any) => sum + Number(o.total_revenue || 0), 0);
      
      results.metrics.revenue_by_outlet = {
        outlets: (outletRevenue || []).map((o: any) => ({
          outlet_id: o.outlet_id,
          outlet_name: o.outlet_name || 'Unknown',
          transaction_count: Number(o.transaction_count) || 0,
          total_revenue: Number(o.total_revenue) || 0,
          average_transaction: Number(o.average_transaction) || 0,
          staff_count: Number(o.staff_count) || 0,
          share_of_revenue: totalRevenue > 0 
            ? Math.round((Number(o.total_revenue) / totalRevenue) * 10000) / 100 
            : 0
        })),
        total_revenue: totalRevenue,
        outlet_count: (outletRevenue || []).length
      };
    }
    
    // 4. Hourly Patterns
    if (metrics.includes('hourly_patterns')) {
      console.log(`Computing hourly patterns for company ${companyId}`);
      
      const hourlyPattern = await this.db.query(`
        SELECT 
          HOUR(pt.trx_at) as hour,
          COUNT(*) as transaction_count,
          COALESCE(SUM(pp.paid_total), 0) as hourly_revenue,
          COALESCE(AVG(pp.paid_total), 0) as avg_transaction
        FROM pos_transactions pt
        LEFT JOIN (
          SELECT pos_transaction_id, SUM(amount) as paid_total
          FROM pos_transaction_payments
          GROUP BY pos_transaction_id
        ) pp ON pp.pos_transaction_id = pt.id
        WHERE pt.company_id = ?
          AND pt.trx_at >= ?
          AND pt.status = 'COMPLETED'
        GROUP BY HOUR(pt.trx_at)
        ORDER BY hour
      `, [companyId, startDate.toISOString()]);
      
      // Find peak hours
      const sortedByCount = [...hourlyPattern].sort((a: any, b: any) => Number(b.transaction_count) - Number(a.transaction_count));
      const peakHour = sortedByCount[0]?.hour || 0;
      const peakCount = sortedByCount[0]?.transaction_count || 0;
      
      // Calculate busiest days
      const dayOfWeekPattern = await this.db.query(`
        SELECT 
          DAYOFWEEK(pt.trx_at) as day_num,
          DAYNAME(pt.trx_at) as day_name,
          COUNT(*) as transaction_count,
          COALESCE(SUM(pp.paid_total), 0) as daily_revenue
        FROM pos_transactions pt
        LEFT JOIN (
          SELECT pos_transaction_id, SUM(amount) as paid_total
          FROM pos_transaction_payments
          GROUP BY pos_transaction_id
        ) pp ON pp.pos_transaction_id = pt.id
        WHERE pt.company_id = ?
          AND pt.trx_at >= ?
          AND pt.status = 'COMPLETED'
        GROUP BY DAYOFWEEK(pt.trx_at), DAYNAME(pt.trx_at)
        ORDER BY day_num
      `, [companyId, startDate.toISOString()]);
      
      results.metrics.hourly_patterns = {
        hourly: (hourlyPattern || []).map((h: any) => ({
          hour: h.hour,
          transaction_count: Number(h.transaction_count) || 0,
          hourly_revenue: Number(h.hourly_revenue) || 0,
          avg_transaction: Number(h.avg_transaction) || 0
        })),
        peak_hour: {
          hour: peakHour,
          transaction_count: Number(peakCount)
        },
        day_of_week: (dayOfWeekPattern || []).map((d: any) => ({
          day_num: d.day_num,
          day_name: d.day_name,
          transaction_count: Number(d.transaction_count) || 0,
          daily_revenue: Number(d.daily_revenue) || 0
        }))
      };
    }
    
    results.completed_at = new Date().toISOString();
    
    // Store results
    await this.db.query(`
      UPDATE backoffice_sync_queue 
      SET result_hash = ?
      WHERE id = ?
    `, [JSON.stringify(results), job.id]);
    
    console.log(`Analytics sync completed for company ${companyId}`);
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
   * Process scheduled export - generate report and deliver to recipients
   */
  private async processScheduledExport(job: BatchJob): Promise<void> {
    const companyId = job.company_id;
    const payload = job.payload || {};
    const exportId = payload.exportId;
    const reportType = payload.reportType || 'SALES';
    const exportFormat = payload.exportFormat || 'CSV';
    const startDate = payload.startDate ? new Date(payload.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = payload.endDate ? new Date(payload.endDate) : new Date();
    
    console.log(`Processing scheduled export ${exportId} for company ${companyId}, type: ${reportType}, format: ${exportFormat}`);

    let csvContent = '';

    if (reportType === 'SALES' || reportType === 'POS_TRANSACTIONS') {
      const transactions = await this.db.query(`
        SELECT 
          pt.id,
          pt.client_tx_id,
          pt.trx_at,
          o.name as outlet_name,
          u.name as cashier_name,
          pt.status,
          COALESCE(p.paid_total, 0) as total_amount,
          pt.discount_percent,
          pt.discount_fixed
        FROM pos_transactions pt
        LEFT JOIN outlets o ON o.id = pt.outlet_id AND o.company_id = pt.company_id
        LEFT JOIN users u ON u.id = pt.cashier_user_id
        LEFT JOIN (
          SELECT pos_transaction_id, SUM(amount) as paid_total
          FROM pos_transaction_payments
          GROUP BY pos_transaction_id
        ) p ON p.pos_transaction_id = pt.id
        WHERE pt.company_id = ?
          AND pt.trx_at >= ?
          AND pt.trx_at < ?
        ORDER BY pt.trx_at DESC
        LIMIT 10000
      `, [companyId, startDate.toISOString(), endDate.toISOString()]);

      const headers = ['Transaction ID', 'Date', 'Outlet', 'Cashier', 'Status', 'Total Amount', 'Discount %', 'Discount Fixed'];
      const rows = (transactions || []).map((t: any) => [
        t.client_tx_id,
        t.trx_at,
        t.outlet_name || '',
        t.cashier_name || '',
        t.status,
        Number(t.total_amount).toFixed(2),
        t.discount_percent || '0',
        t.discount_fixed || '0'
      ]);

      csvContent = [headers.join(','), ...rows.map((r: string[]) => r.map(cell => `"${cell}"`).join(','))].join('\n');
    } else if (reportType === 'FINANCIAL' || reportType === 'JOURNAL') {
      const journals = await this.db.query(`
        SELECT 
          jb.id,
          jb.doc_type,
          jb.posted_at,
          o.name as outlet_name,
          a.account_code,
          a.account_name,
          jl.debit,
          jl.credit,
          jl.description
        FROM journal_lines jl
        INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
        LEFT JOIN outlets o ON o.id = jb.outlet_id AND o.company_id = jb.company_id
        LEFT JOIN accounts a ON a.id = jl.account_id
        WHERE jb.company_id = ?
          AND jb.posted_at >= ?
          AND jb.posted_at < ?
        ORDER BY jb.posted_at DESC
        LIMIT 10000
      `, [companyId, startDate.toISOString(), endDate.toISOString()]);

      const headers = ['Batch ID', 'Doc Type', 'Date', 'Outlet', 'Account Code', 'Account Name', 'Debit', 'Credit', 'Description'];
      const rows = (journals || []).map((j: any) => [
        j.id,
        j.doc_type,
        j.posted_at,
        j.outlet_name || '',
        j.account_code,
        j.account_name,
        Number(j.debit || 0).toFixed(2),
        Number(j.credit || 0).toFixed(2),
        j.description || ''
      ]);

      csvContent = [headers.join(','), ...rows.map((r: string[]) => r.map(cell => `"${cell}"`).join(','))].join('\n');
    } else if (reportType === 'INVENTORY') {
      const items = await this.db.query(`
        SELECT 
          i.sku,
          i.name as item_name,
          ig.name as group_name,
          ip.price as current_price,
          COUNT(DISTINCT pti.id) as times_sold
        FROM items i
        LEFT JOIN item_groups ig ON ig.id = i.item_group_id AND ig.company_id = i.company_id
        LEFT JOIN item_prices ip ON ip.item_id = i.id AND ip.company_id = i.company_id AND ip.is_active = 1
        LEFT JOIN pos_transaction_items pti ON pti.item_id = i.id
        LEFT JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id AND pt.company_id = i.company_id AND pt.status = 'COMPLETED'
        WHERE i.company_id = ?
          AND i.item_type IN ('PRODUCT', 'INGREDIENT')
        GROUP BY i.id
        ORDER BY times_sold DESC
        LIMIT 1000
      `, [companyId]);

      const headers = ['SKU', 'Item Name', 'Group', 'Current Price', 'Times Sold'];
      const rows = (items || []).map((i: any) => [
        i.sku,
        i.item_name,
        i.group_name || '',
        Number(i.current_price || 0).toFixed(2),
        i.times_sold || 0
      ]);

      csvContent = [headers.join(','), ...rows.map((r: string[]) => r.map(cell => `"${cell}"`).join(','))].join('\n');
    } else if (reportType === 'AUDIT') {
      const logs = await this.db.query(`
        SELECT 
          al.id,
          al.action,
          al.entity_type,
          al.entity_id,
          al.result,
          al.created_at,
          u.name as user_name,
          al.ip_address
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.company_id = ?
          AND al.created_at >= ?
          AND al.created_at < ?
        ORDER BY al.created_at DESC
        LIMIT 5000
      `, [companyId, startDate.toISOString(), endDate.toISOString()]);

      const headers = ['ID', 'Action', 'Entity Type', 'Entity ID', 'Result', 'Created At', 'User', 'IP Address'];
      const rows = (logs || []).map((l: any) => [
        l.id,
        l.action,
        l.entity_type,
        l.entity_id,
        l.result,
        l.created_at,
        l.user_name || '',
        l.ip_address || ''
      ]);

      csvContent = [headers.join(','), ...rows.map((r: string[]) => r.map(cell => `"${cell}"`).join(','))].join('\n');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${reportType.toLowerCase()}-${timestamp}.csv`;
    const filePath = `/tmp/exports/${companyId}/${fileName}`;
    const fs = await import('fs');
    const dirPath = `/tmp/exports/${companyId}`;
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    fs.writeFileSync(filePath, csvContent);
    const fileSize = fs.statSync(filePath).size;

    await this.db.query(`
      INSERT INTO export_files (
        company_id, scheduled_export_id, batch_job_id, file_name, file_size, file_path, storage_provider, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'LOCAL', DATE_ADD(NOW(), INTERVAL 7 DAY))
    `, [companyId, exportId, job.id, fileName, fileSize, filePath]);

    const recipientsResult = await this.db.querySingle(`
      SELECT recipients FROM scheduled_exports WHERE id = ? AND company_id = ?
    `, [exportId, companyId]);

    const recipients = recipientsResult ? JSON.parse(recipientsResult.recipients) : [];
    const deliveryMethod = recipientsResult?.delivery_method || 'EMAIL';

    if (deliveryMethod === 'EMAIL' && recipients.length > 0) {
      for (const recipient of recipients) {
        const emailContent = `<p>Your scheduled ${reportType} report is ready.</p>
          <p>Period: ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}</p>
          <p>Download: <a href="/api/backoffice/exports/files/latest?export=${exportId}">Click here to download</a></p>
          <p><small>This link expires in 7 days.</small></p>`;

        await this.db.query(`
          INSERT INTO email_outbox (company_id, to_email, subject, html, text, status, attachment_path)
          VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
        `, [
          companyId,
          recipient.email,
          `Jurnapod Export: ${reportType} Report`,
          emailContent,
          emailContent.replace(/<[^>]*>/g, ''),
          filePath
        ]);
      }
    }

    await this.db.query(`
      UPDATE backoffice_sync_queue 
      SET result_hash = ?
      WHERE id = ?
    `, [JSON.stringify({ exportId, fileName, fileSize, recipientCount: recipients.length }), job.id]);

    console.log(`Scheduled export ${exportId} completed: ${fileName} (${fileSize} bytes) sent to ${recipients.length} recipients`);
  }

  /**
   * Generate sales forecast using moving averages
   */
  private async generateForecast(job: BatchJob): Promise<void> {
    const companyId = job.company_id;
    const payload = job.payload || {};
    const forecastDays = payload.forecastDays || 30;
    const forecastType = payload.forecastType || 'DAILY';
    
    console.log(`Generating ${forecastType} forecast for company ${companyId}, ${forecastDays} days`);

    const historicalDays = forecastType === 'DAILY' ? 90 : (forecastType === 'WEEKLY' ? 52 * 2 : 36);
    const startDate = new Date(Date.now() - historicalDays * 24 * 60 * 60 * 1000);

    const historicalSales = await this.db.query(`
      SELECT 
        DATE(pt.trx_at) as sale_date,
        COALESCE(SUM(p.paid_total), 0) as daily_sales
      FROM pos_transactions pt
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(amount) as paid_total
        FROM pos_transaction_payments
        GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.status = 'COMPLETED'
      GROUP BY DATE(pt.trx_at)
      ORDER BY sale_date ASC
    `, [companyId, startDate.toISOString()]);

    const salesArray = (historicalSales || []).map((s: any) => Number(s.daily_sales));
    
    if (salesArray.length < 7) {
      await this.db.query(`
        UPDATE backoffice_sync_queue 
        SET result_hash = ?, sync_status = 'SUCCESS', processed_at = NOW()
        WHERE id = ?
      `, [JSON.stringify({ message: 'Insufficient historical data for forecast' }), job.id]);
      console.log(`Insufficient data for forecast for company ${companyId}`);
      return;
    }

    const last7Days = salesArray.slice(-7);
    const last30Days = salesArray.slice(-30);
    
    const avg7 = last7Days.reduce((a: number, b: number) => a + b, 0) / last7Days.length;
    const avg30 = last30Days.reduce((a: number, b: number) => a + b, 0) / last30Days.length;
    
    const variance = last30Days.reduce((sum: number, val: number) => sum + Math.pow(val - avg30, 2), 0) / last30Days.length;
    const stdDev = Math.sqrt(variance);
    
    const trend = (avg7 - avg30) / avg30;
    const basePrediction = avg30 * (1 + trend * 0.3);
    
    const predictions = [];
    const baseDate = new Date();
    
    for (let i = 1; i <= forecastDays; i++) {
      const forecastDate = new Date(baseDate);
      forecastDate.setDate(baseDate.getDate() + i);
      
      const dayOfWeek = forecastDate.getDay();
      const dayFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.15 : 1.0;
      
      const predicted = basePrediction * dayFactor;
      const confidenceRange = stdDev * 1.96;
      
      predictions.push({
        forecast_date: forecastDate.toISOString().slice(0, 10),
        predicted_amount: Number(predicted.toFixed(2)),
        confidence_lower: Number((predicted - confidenceRange).toFixed(2)),
        confidence_upper: Number((predicted + confidenceRange).toFixed(2))
      });
    }

    await this.db.query(`
      DELETE FROM sales_forecasts 
      WHERE company_id = ? AND forecast_type = ? AND forecast_date >= NOW()
    `, [companyId, forecastType]);

    for (const pred of predictions) {
      await this.db.query(`
        INSERT INTO sales_forecasts (company_id, forecast_type, forecast_date, predicted_amount, confidence_lower, confidence_upper, model_version)
        VALUES (?, ?, ?, ?, ?, ?, 'v1.0')
        ON DUPLICATE KEY UPDATE predicted_amount = VALUES(predicted_amount), confidence_lower = VALUES(confidence_lower), confidence_upper = VALUES(confidence_upper)
      `, [companyId, forecastType, pred.forecast_date, pred.predicted_amount, pred.confidence_lower, pred.confidence_upper]);
    }

    await this.db.query(`
      UPDATE backoffice_sync_queue 
      SET result_hash = ?
      WHERE id = ?
    `, [JSON.stringify({ 
      forecastType, 
      daysGenerated: forecastDays, 
      avgDailySales: avg30,
      trend: (trend * 100).toFixed(2) + '%'
    }), job.id]);

    console.log(`Forecast generated for company ${companyId}: ${forecastDays} days, avg: ${avg30}, trend: ${(trend * 100).toFixed(1)}%`);
  }

  /**
   * Calculate analytics insights (trends, anomalies, peak hours)
   */
  private async calculateInsights(job: BatchJob): Promise<void> {
    const companyId = job.company_id;
    const payload = job.payload || {};
    const period = payload.period || 30;
    
    console.log(`Calculating analytics insights for company ${companyId}, period: ${period} days`);

    const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

    const insights: Array<{
      insight_type: string;
      metric_name: string;
      metric_value: number;
      reference_period: string;
      severity: string;
      description: string;
      recommendation?: string;
    }> = [];

    const hourlyData = await this.db.query(`
      SELECT 
        HOUR(pt.trx_at) as hour_of_day,
        COUNT(*) as transaction_count,
        COALESCE(SUM(p.paid_total), 0) as hourly_sales
      FROM pos_transactions pt
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(amount) as paid_total
        FROM pos_transaction_payments
        GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.status = 'COMPLETED'
      GROUP BY HOUR(pt.trx_at)
      ORDER BY hourly_sales DESC
    `, [companyId, startDate.toISOString()]);

    if (hourlyData && hourlyData.length > 0) {
      const peakHour = hourlyData[0];
      insights.push({
        insight_type: 'PEAK_HOURS',
        metric_name: 'peak_hour_sales',
        metric_value: Number(peakHour.hourly_sales),
        reference_period: `last-${period}-days`,
        severity: 'INFO',
        description: `Peak revenue hour is ${peakHour.hour_of_day}:00 with ${Number(peakHour.hourly_sales).toFixed(2)} in sales`,
        recommendation: 'Consider increasing staff during peak hours'
      });
    }

    const dailyData = await this.db.query(`
      SELECT 
        DAYOFWEEK(pt.trx_at) as day_of_week,
        COUNT(*) as transaction_count,
        COALESCE(SUM(p.paid_total), 0) as daily_sales
      FROM pos_transactions pt
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(amount) as paid_total
        FROM pos_transaction_payments
        GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.status = 'COMPLETED'
      GROUP BY DAYOFWEEK(pt.trx_at)
      ORDER BY daily_sales DESC
    `, [companyId, startDate.toISOString()]);

    if (dailyData && dailyData.length > 0) {
      const bestDay = dailyData[0];
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      insights.push({
        insight_type: 'SEASONALITY',
        metric_name: 'best_day_sales',
        metric_value: Number(bestDay.daily_sales),
        reference_period: `last-${period}-days`,
        severity: 'INFO',
        description: `Best performing day is ${dayNames[bestDay.day_of_week - 1]} with ${Number(bestDay.daily_sales).toFixed(2)} in sales`,
        recommendation: 'Plan promotions for slower days'
      });
    }

    const currentPeriodStart = new Date(Date.now() - (period / 2) * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

    const currentSales = await this.db.querySingle(`
      SELECT COALESCE(SUM(p.paid_total), 0) as total
      FROM pos_transactions pt
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(amount) as paid_total
        FROM pos_transaction_payments
        GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.status = 'COMPLETED'
    `, [companyId, currentPeriodStart.toISOString()]);

    const previousSales = await this.db.querySingle(`
      SELECT COALESCE(SUM(p.paid_total), 0) as total
      FROM pos_transactions pt
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(amount) as paid_total
        FROM pos_transaction_payments
        GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.trx_at < ?
        AND pt.status = 'COMPLETED'
    `, [companyId, previousPeriodStart.toISOString(), currentPeriodStart.toISOString()]);

    const currentTotal = Number(currentSales?.total || 0);
    const previousTotal = Number(previousSales?.total || 0);
    
    if (previousTotal > 0) {
      const changePercent = ((currentTotal - previousTotal) / previousTotal) * 100;
      
      if (Math.abs(changePercent) > 20) {
        insights.push({
          insight_type: changePercent > 0 ? 'TREND' : 'ANOMALY',
          metric_name: 'sales_change_percent',
          metric_value: changePercent,
          reference_period: `last-${period}-days`,
          severity: changePercent > 0 ? 'INFO' : 'WARNING',
          description: `Sales ${changePercent > 0 ? 'increased' : 'decreased'} by ${Math.abs(changePercent).toFixed(1)}% compared to previous ${period} days`,
          recommendation: changePercent > 0 ? 'Continue current strategies' : 'Investigate causes of decline'
        });
      }
    }

    const topProducts = await this.db.query(`
      SELECT 
        pti.item_name,
        SUM(pti.qty * pti.price_snapshot) as total_sales
      FROM pos_transaction_items pti
      INNER JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id
      WHERE pt.company_id = ?
        AND pt.trx_at >= ?
        AND pt.status = 'COMPLETED'
      GROUP BY pti.item_name
      ORDER BY total_sales DESC
      LIMIT 5
    `, [companyId, startDate.toISOString()]);

    if (topProducts && topProducts.length > 0) {
      const topProduct = topProducts[0];
      const totalRevenue = topProducts.reduce((sum: number, p: any) => sum + Number(p.total_sales), 0);
      const marketShare = (Number(topProduct.total_sales) / totalRevenue) * 100;
      
      insights.push({
        insight_type: 'TOP_PRODUCTS',
        metric_name: 'top_product_revenue',
        metric_value: Number(topProduct.total_sales),
        reference_period: `last-${period}-days`,
        severity: 'INFO',
        description: `Top seller: ${topProduct.item_name} with ${Number(topProduct.total_sales).toFixed(2)} (${marketShare.toFixed(1)}% of top 5)`,
        recommendation: 'Ensure consistent stock for top products'
      });
    }

    const underperforming = await this.db.query(`
      SELECT 
        o.id as outlet_id,
        o.name as outlet_name,
        COALESCE(SUM(p.paid_total), 0) as total_sales,
        COUNT(DISTINCT pt.id) as transaction_count
      FROM outlets o
      LEFT JOIN pos_transactions pt ON pt.outlet_id = o.id AND pt.company_id = o.company_id AND pt.trx_at >= ? AND pt.status = 'COMPLETED'
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(amount) as paid_total
        FROM pos_transaction_payments
        GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      WHERE o.company_id = ?
        AND o.deleted_at IS NULL
      GROUP BY o.id
      HAVING transaction_count < 10 OR total_sales < 1000
      ORDER BY total_sales ASC
      LIMIT 3
    `, [startDate.toISOString(), companyId]);

    if (underperforming && underperforming.length > 0) {
      for (const outlet of underperforming) {
        insights.push({
          insight_type: 'UNDERPERFORMING',
          metric_name: 'outlet_revenue',
          metric_value: Number(outlet.total_sales),
          reference_period: `last-${period}-days`,
          severity: 'WARNING',
          description: `Outlet "${outlet.outlet_name}" has low performance: ${outlet.transaction_count} transactions, ${Number(outlet.total_sales).toFixed(2)} revenue`,
          recommendation: 'Review staffing and marketing for this outlet'
        });
      }
    }

    await this.db.query(`
      DELETE FROM analytics_insights 
      WHERE company_id = ? AND expires_at < NOW()
    `, [companyId]);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    for (const insight of insights) {
      await this.db.query(`
        INSERT INTO analytics_insights (
          company_id, insight_type, metric_name, metric_value, reference_period, severity, description, recommendation, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        companyId, insight.insight_type, insight.metric_name, insight.metric_value,
        insight.reference_period, insight.severity, insight.description, insight.recommendation || null, expiresAt
      ]);
    }

    await this.db.query(`
      UPDATE backoffice_sync_queue 
      SET result_hash = ?
      WHERE id = ?
    `, [JSON.stringify({ insightsGenerated: insights.length, period: `${period} days` }), job.id]);

    console.log(`Generated ${insights.length} insights for company ${companyId}`);
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