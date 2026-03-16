// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { DatabaseConnection } from "../core/backoffice-data-service.js";

export interface ScheduledExport {
  id: number;
  company_id: number;
  name: string;
  report_type: string;
  export_format: string;
  schedule_type: string;
  schedule_config: {
    hour: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
  filters: Record<string, any> | null;
  recipients: Array<{ email: string; type: string }>;
  delivery_method: string;
  webhook_url: string | null;
  is_active: boolean;
  last_run_at: Date | null;
  next_run_at: Date;
}

export interface ExportSchedulerConfig {
  pollIntervalMs: number;
}

export class ExportScheduler {
  private isRunning = false;
  private pollTimer?: NodeJS.Timeout;
  private batchProcessor: any;

  constructor(
    private db: DatabaseConnection,
    private config: ExportSchedulerConfig = {
      pollIntervalMs: 60_000 // 1 minute
    }
  ) {}

  setBatchProcessor(processor: any): void {
    this.batchProcessor = processor;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('Starting export scheduler...');

    await this.checkDueExports();

    this.pollTimer = setInterval(() => {
      this.checkDueExports().catch(error => {
        console.error('Export scheduler error:', error);
      });
    }, this.config.pollIntervalMs);

    console.log('Export scheduler started');
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    console.log('Export scheduler stopped');
  }

  private async checkDueExports(): Promise<void> {
    if (!this.isRunning) return;

    const dueExports = await this.db.query(`
      SELECT * FROM scheduled_exports
      WHERE is_active = 1
        AND next_run_at <= NOW()
      ORDER BY next_run_at ASC
      LIMIT 10
    `) as ScheduledExport[];

    for (const exportConfig of dueExports) {
      try {
        await this.queueExportJob(exportConfig);
        await this.updateNextRun(exportConfig);
        console.log(`Queued scheduled export ${exportConfig.id}: ${exportConfig.name}`);
      } catch (error) {
        console.error(`Failed to queue scheduled export ${exportConfig.id}:`, error);
      }
    }

    if (dueExports.length > 0) {
      console.log(`Processed ${dueExports.length} due exports`);
    }
  }

  private async queueExportJob(exportConfig: ScheduledExport): Promise<void> {
    const filters = exportConfig.filters ? JSON.parse(exportConfig.filters as any) : {};
    const scheduleConfig = typeof exportConfig.schedule_config === 'string'
      ? JSON.parse(exportConfig.schedule_config)
      : exportConfig.schedule_config;

    const endDate = new Date();
    let startDate = new Date();

    switch (exportConfig.schedule_type) {
      case 'DAILY':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'WEEKLY':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'MONTHLY':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'ONCE':
        startDate = filters.startDate ? new Date(filters.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const payload = {
      exportId: exportConfig.id,
      reportType: exportConfig.report_type,
      exportFormat: exportConfig.export_format,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      filters,
      recipients: exportConfig.recipients,
      deliveryMethod: exportConfig.delivery_method,
      webhookUrl: exportConfig.webhook_url
    };

    if (this.batchProcessor) {
      await this.batchProcessor.queueJob({
        company_id: exportConfig.company_id,
        job_type: 'SCHEDULED_EXPORT',
        priority: 'MEDIUM',
        payload,
        scheduled_at: new Date(),
        max_retries: 3
      });
    } else {
      const jobId = crypto.randomUUID();
      await this.db.query(`
        INSERT INTO backoffice_sync_queue (
          id, company_id, document_type, tier, sync_status, scheduled_at, retry_count, max_retries, payload_hash
        ) VALUES (?, ?, 'SCHEDULED_EXPORT', 'ANALYTICS', 'PENDING', NOW(), 0, 3, ?)
      `, [jobId, exportConfig.company_id, JSON.stringify(payload)]);
    }

    await this.db.query(`
      UPDATE scheduled_exports SET last_run_at = NOW() WHERE id = ?
    `, [exportConfig.id]);
  }

  private async updateNextRun(exportConfig: ScheduledExport): Promise<void> {
    const scheduleConfig = typeof exportConfig.schedule_config === 'string'
      ? JSON.parse(exportConfig.schedule_config)
      : exportConfig.schedule_config;

    let nextRun = new Date();
    const hour = scheduleConfig.hour || 0;

    switch (exportConfig.schedule_type) {
      case 'DAILY':
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(hour, 0, 0, 0);
        break;
      case 'WEEKLY':
        nextRun.setDate(nextRun.getDate() + (7 - nextRun.getDay() + (scheduleConfig.dayOfWeek || 1)) % 7 + 1);
        nextRun.setHours(hour, 0, 0, 0);
        if (nextRun <= new Date()) {
          nextRun.setDate(nextRun.getDate() + 7);
        }
        break;
      case 'MONTHLY':
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(scheduleConfig.dayOfMonth || 1);
        nextRun.setHours(hour, 0, 0, 0);
        break;
      case 'ONCE':
        nextRun = new Date('2099-12-31');
        break;
    }

    await this.db.query(`
      UPDATE scheduled_exports SET next_run_at = ? WHERE id = ?
    `, [nextRun.toISOString(), exportConfig.id]);
  }

  async getScheduledExports(companyId: number): Promise<ScheduledExport[]> {
    return await this.db.query(`
      SELECT * FROM scheduled_exports
      WHERE company_id = ?
      ORDER BY next_run_at ASC
    `, [companyId]) as ScheduledExport[];
  }

  async getScheduledExport(companyId: number, id: number): Promise<ScheduledExport | null> {
    const result = await this.db.querySingle(`
      SELECT * FROM scheduled_exports
      WHERE company_id = ? AND id = ?
    `, [companyId, id]);
    return result as ScheduledExport | null;
  }

  async createScheduledExport(data: {
    company_id: number;
    name: string;
    report_type: string;
    export_format: string;
    schedule_type: string;
    schedule_config: any;
    filters?: any;
    recipients: any[];
    delivery_method: string;
    webhook_url?: string;
    created_by_user_id: number;
  }): Promise<number> {
    const scheduleConfig = data.schedule_config;
    let nextRun = new Date();
    const hour = scheduleConfig.hour || 0;

    switch (data.schedule_type) {
      case 'DAILY':
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(hour, 0, 0, 0);
        break;
      case 'WEEKLY':
        nextRun.setDate(nextRun.getDate() + (7 - nextRun.getDay()));
        nextRun.setHours(hour, 0, 0, 0);
        break;
      case 'MONTHLY':
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(scheduleConfig.dayOfMonth || 1);
        nextRun.setHours(hour, 0, 0, 0);
        break;
      case 'ONCE':
        nextRun = new Date(scheduleConfig.runAt || Date.now());
        break;
    }

    const result = await this.db.query(`
      INSERT INTO scheduled_exports (
        company_id, name, report_type, export_format, schedule_type, schedule_config,
        filters, recipients, delivery_method, webhook_url, next_run_at, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.company_id,
      data.name,
      data.report_type,
      data.export_format,
      data.schedule_type,
      JSON.stringify(scheduleConfig),
      data.filters ? JSON.stringify(data.filters) : null,
      JSON.stringify(data.recipients),
      data.delivery_method,
      data.webhook_url || null,
      nextRun.toISOString(),
      data.created_by_user_id
    ]);

    return (result as any).insertId;
  }

  async updateScheduledExport(companyId: number, id: number, data: Partial<{
    name: string;
    report_type: string;
    export_format: string;
    schedule_type: string;
    schedule_config: any;
    filters: any;
    recipients: any[];
    delivery_method: string;
    webhook_url: string;
    is_active: boolean;
  }>): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.report_type !== undefined) {
      updates.push('report_type = ?');
      values.push(data.report_type);
    }
    if (data.export_format !== undefined) {
      updates.push('export_format = ?');
      values.push(data.export_format);
    }
    if (data.schedule_type !== undefined) {
      updates.push('schedule_type = ?');
      values.push(data.schedule_type);
    }
    if (data.schedule_config !== undefined) {
      updates.push('schedule_config = ?');
      values.push(JSON.stringify(data.schedule_config));
    }
    if (data.filters !== undefined) {
      updates.push('filters = ?');
      values.push(JSON.stringify(data.filters));
    }
    if (data.recipients !== undefined) {
      updates.push('recipients = ?');
      values.push(JSON.stringify(data.recipients));
    }
    if (data.delivery_method !== undefined) {
      updates.push('delivery_method = ?');
      values.push(data.delivery_method);
    }
    if (data.webhook_url !== undefined) {
      updates.push('webhook_url = ?');
      values.push(data.webhook_url);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(data.is_active);
    }

    if (updates.length === 0) return;

    values.push(companyId, id);

    await this.db.query(`
      UPDATE scheduled_exports SET ${updates.join(', ')} WHERE company_id = ? AND id = ?
    `, values);
  }

  async deleteScheduledExport(companyId: number, id: number): Promise<void> {
    await this.db.query(`
      DELETE FROM scheduled_exports WHERE company_id = ? AND id = ?
    `, [companyId, id]);
  }
}
