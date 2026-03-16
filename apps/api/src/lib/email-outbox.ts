// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "./db";
import { getAppEnv } from "./env";
import { getMailer, MailerError } from "./mailer";

export type EmailOutboxStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

type EmailOutboxRow = RowDataPacket & {
  id: number;
  company_id: number;
  user_id: number | null;
  to_email: string;
  subject: string;
  html: string;
  text: string;
  status: string;
  error_message: string | null;
  attempts: number;
  next_retry_at: string | null;
  created_at: string;
  sent_at: string | null;
};

export async function queueEmail(params: {
  companyId: number;
  userId?: number;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
}): Promise<number> {
  const pool = getDbPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO email_outbox (company_id, user_id, to_email, subject, html, text, status)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
    [params.companyId, params.userId ?? null, params.toEmail, params.subject, params.html, params.text]
  );
  return Number(result.insertId);
}

export async function processPendingEmails(): Promise<{ processed: number; sent: number; failed: number }> {
  const pool = getDbPool();
  const env = getAppEnv();
  const { retryMaxAttempts, retryBackoffSeconds } = env.email.outbox;

  // First, atomically claim pending emails by setting them to SENDING
  // This prevents concurrent workers from processing the same emails
  await pool.execute(
    `UPDATE email_outbox 
     SET status = 'SENDING'
     WHERE status = 'PENDING' 
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY created_at ASC
     LIMIT 50`
  );

  // Now fetch only the emails we just claimed
  const [rows] = await pool.execute<EmailOutboxRow[]>(
    `SELECT id, company_id, user_id, to_email, subject, html, text, attempts
     FROM email_outbox
     WHERE status = 'SENDING'
     ORDER BY created_at ASC
     LIMIT 50`
  );

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const connection = await pool.getConnection();
    try {
      const mailer = await getMailer();
      await mailer.sendMail({
        to: row.to_email,
        subject: row.subject,
        html: row.html,
        text: row.text
      });

      await connection.execute(
        `UPDATE email_outbox SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [row.id]
      );
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const isMaxAttempts = attempts >= retryMaxAttempts;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (isMaxAttempts) {
        await connection.execute(
          `UPDATE email_outbox SET status = 'FAILED', attempts = ?, error_message = ? WHERE id = ?`,
          [attempts, errorMessage, row.id]
        );
      } else {
        const nextRetry = new Date(Date.now() + retryBackoffSeconds * 1000 * Math.pow(2, attempts - 1));
        await connection.execute(
          `UPDATE email_outbox SET status = 'PENDING', attempts = ?, error_message = ?, next_retry_at = ? WHERE id = ?`,
          [attempts, errorMessage, nextRetry, row.id]
        );
      }
      failed++;
    } finally {
      connection.release();
    }
  }

  return { processed: rows.length, sent, failed };
}

export async function getPendingEmailCount(): Promise<number> {
  const pool = getDbPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM email_outbox WHERE status = 'PENDING'`
  );
  return Number(rows[0].count);
}

export async function retryFailedEmail(emailId: number): Promise<void> {
  const pool = getDbPool();
  await pool.execute(
    `UPDATE email_outbox SET status = 'PENDING', attempts = 0, next_retry_at = NULL, error_message = NULL WHERE id = ?`,
    [emailId]
  );
}
