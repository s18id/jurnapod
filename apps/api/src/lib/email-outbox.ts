// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "./db";
import { getAppEnv } from "./env";
import { getMailer, MailerError } from "./mailer";

export type EmailOutboxStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

export async function queueEmail(params: {
  companyId: number;
  userId?: number;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
}): Promise<number> {
  const db = getDb();
  const result = await db
    .insertInto("email_outbox")
    .values({
      company_id: params.companyId,
      user_id: params.userId ?? null,
      to_email: params.toEmail,
      subject: params.subject,
      html: params.html,
      text: params.text,
      status: "PENDING",
    })
    .returningAll()
    .executeTakeFirst();
  return Number(result!.id);
}

export async function processPendingEmails(): Promise<{ processed: number; sent: number; failed: number }> {
  const db = getDb();
  const env = getAppEnv();
  const { retryMaxAttempts, retryBackoffSeconds } = env.email.outbox;

  // First, atomically claim pending emails by setting them to SENDING
  // This prevents concurrent workers from processing the same emails
  await db
    .updateTable("email_outbox")
    .set({ status: "SENDING" })
    .where("status", "=", "PENDING")
    .where((eb) => eb.or([eb("next_retry_at", "is", null), eb("next_retry_at", "<=", new Date())]))
    .orderBy("created_at", "asc")
    .limit(50)
    .execute();

  // Now fetch only the emails we just claimed
  const rows = await db
    .selectFrom("email_outbox")
    .where("status", "=", "SENDING")
    .orderBy("created_at", "asc")
    .limit(50)
    .select(["id", "company_id", "user_id", "to_email", "subject", "html", "text", "attempts"])
    .execute();

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const mailer = await getMailer();
      const result = await mailer.send({
        to: row.to_email,
        subject: row.subject,
        html: row.html,
        text: row.text,
      });

      if (!result.success) {
        throw new Error(result.error ?? "Email send failed");
      }

      await db
        .updateTable("email_outbox")
        .set({ status: "SENT", sent_at: new Date() })
        .where("id", "=", row.id)
        .execute();
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const isMaxAttempts = attempts >= retryMaxAttempts;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (isMaxAttempts) {
        await db
          .updateTable("email_outbox")
          .set({ status: "FAILED", attempts, error_message: errorMessage })
          .where("id", "=", row.id)
          .execute();
      } else {
        const nextRetry = new Date(Date.now() + retryBackoffSeconds * 1000 * Math.pow(2, attempts - 1));
        await db
          .updateTable("email_outbox")
          .set({ status: "PENDING", attempts, error_message: errorMessage, next_retry_at: nextRetry })
          .where("id", "=", row.id)
          .execute();
      }
      failed++;
    }
  }

  return { processed: rows.length, sent, failed };
}

export async function getPendingEmailCount(): Promise<number> {
  const db = getDb();
  const result = await db
    .selectFrom("email_outbox")
    .where("status", "=", "PENDING")
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .executeTakeFirst();
  return Number(result?.count ?? 0);
}

export async function retryFailedEmail(emailId: number): Promise<void> {
  const db = getDb();
  await db
    .updateTable("email_outbox")
    .set({ status: "PENDING", attempts: 0, next_retry_at: null, error_message: null })
    .where("id", "=", emailId)
    .execute();
}
