import { type ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { SyncPushRequestSchema, SyncPushResponseSchema, type SyncPushResultItem } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireOutletAccess, requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getRequestCorrelationId } from "../../../../src/lib/correlation-id";
import { getDbPool } from "../../../../src/lib/db";
import {
  SyncPushPostingHookError,
  runSyncPushPostingHook
} from "../../../../src/lib/sync-push-posting";

const MYSQL_DUPLICATE_ERROR_CODE = 1062;
const SYNC_PUSH_ACCEPTED_AUDIT_ACTION = "SYNC_PUSH_ACCEPTED";
const SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION = "SYNC_PUSH_POSTING_HOOK_FAIL";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Sync push failed"
  }
};

type MysqlError = {
  errno?: number;
};

type SyncPushResultCode = "OK" | "DUPLICATE" | "ERROR";

type AcceptedSyncPushContext = {
  correlationId: string;
  companyId: number;
  outletId: number;
  userId: number;
  clientTxId: string;
  trxAt: string;
  posTransactionId: number;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

function isMysqlError(error: unknown): error is MysqlError {
  return typeof error === "object" && error !== null && "errno" in error;
}

function toMysqlDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid trx_at");
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toErrorResult(clientTxId: string, message: string): SyncPushResultItem {
  return {
    client_tx_id: clientTxId,
    result: "ERROR",
    message
  };
}

function logSyncPushTransactionResult(params: {
  correlationId: string;
  clientTxId: string;
  result: SyncPushResultCode;
}) {
  console.info("POST /sync/push transaction", {
    correlation_id: params.correlationId,
    client_tx_id: params.clientTxId,
    result: params.result
  });
}

async function runAcceptedSyncPushHook(
  dbExecutor: QueryExecutor,
  context: AcceptedSyncPushContext
): Promise<void> {
  await dbExecutor.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       ip_address,
       payload_json
     ) VALUES (?, ?, ?, ?, 'SUCCESS', NULL, ?)`,
    [
      context.companyId,
      context.outletId,
      context.userId,
      SYNC_PUSH_ACCEPTED_AUDIT_ACTION,
      JSON.stringify({
        pos_transaction_id: context.posTransactionId,
        client_tx_id: context.clientTxId,
        trx_at: context.trxAt,
        correlation_id: context.correlationId
      })
    ]
  );
}

async function recordSyncPushPostingHookFailure(
  dbExecutor: QueryExecutor,
  context: AcceptedSyncPushContext,
  error: unknown
): Promise<void> {
  const mode = error instanceof SyncPushPostingHookError ? error.mode : "unknown";
  const message = error instanceof Error ? error.message : "SYNC_PUSH_POSTING_HOOK_FAILED";

  console.error("POST /sync/push posting hook failed", {
    correlation_id: context.correlationId,
    client_tx_id: context.clientTxId,
    mode,
    error
  });

  try {
    await dbExecutor.execute(
      `INSERT INTO audit_logs (
         company_id,
         outlet_id,
         user_id,
         action,
         result,
         ip_address,
         payload_json
       ) VALUES (?, ?, ?, ?, 'FAIL', NULL, ?)`,
      [
        context.companyId,
        context.outletId,
        context.userId,
        SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION,
        JSON.stringify({
          correlation_id: context.correlationId,
          pos_transaction_id: context.posTransactionId,
          client_tx_id: context.clientTxId,
          mode,
          reason: message
        })
      ]
    );
  } catch (auditError) {
    console.error("POST /sync/push posting hook failure audit insert failed", {
      correlation_id: context.correlationId,
      client_tx_id: context.clientTxId,
      error: auditError
    });
  }
}

const syncPushOutletGuardSchema = SyncPushRequestSchema.pick({
  outlet_id: true
});

const invalidJsonGuardError = new ZodError([
  {
    code: z.ZodIssueCode.custom,
    message: "Invalid request",
    path: []
  }
]);

async function parseOutletIdForGuard(request: Request): Promise<number> {
  try {
    const payload = await request.clone().json();
    return syncPushOutletGuardSchema.parse(payload).outlet_id;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw invalidJsonGuardError;
    }

    throw error;
  }
}

export const POST = withAuth(
  async (request, auth) => {
    const correlationId = getRequestCorrelationId(request);

    try {
      const payload = await request.json();
      const input = SyncPushRequestSchema.parse(payload);
      const dbPool = getDbPool();
      const dbConnection = await dbPool.getConnection();
      const results: SyncPushResultItem[] = [];
      try {
        for (const tx of input.transactions) {
          if (tx.company_id !== auth.companyId) {
            results.push(toErrorResult(tx.client_tx_id, "company_id mismatch"));
            logSyncPushTransactionResult({
              correlationId,
              clientTxId: tx.client_tx_id,
              result: "ERROR"
            });
            continue;
          }

          if (tx.outlet_id !== input.outlet_id) {
            results.push(toErrorResult(tx.client_tx_id, "outlet_id mismatch"));
            logSyncPushTransactionResult({
              correlationId,
              clientTxId: tx.client_tx_id,
              result: "ERROR"
            });
            continue;
          }

          try {
            const [insertResult] = await dbConnection.execute<ResultSetHeader>(
              `INSERT INTO pos_transactions (company_id, outlet_id, client_tx_id, status, trx_at)
               VALUES (?, ?, ?, ?, ?)`,
              [
                tx.company_id,
                tx.outlet_id,
                tx.client_tx_id,
                tx.status,
                toMysqlDateTime(tx.trx_at)
              ]
            );

            const acceptedContext: AcceptedSyncPushContext = {
              correlationId,
              companyId: tx.company_id,
              outletId: tx.outlet_id,
              userId: auth.userId,
              clientTxId: tx.client_tx_id,
              trxAt: tx.trx_at,
              posTransactionId: Number(insertResult.insertId)
            };

            await runAcceptedSyncPushHook(dbConnection, acceptedContext);

            try {
              await runSyncPushPostingHook(dbConnection, acceptedContext);
            } catch (postingHookError) {
              await recordSyncPushPostingHookFailure(dbConnection, acceptedContext, postingHookError);
            }

            results.push({
              client_tx_id: tx.client_tx_id,
              result: "OK"
            });
            logSyncPushTransactionResult({
              correlationId,
              clientTxId: tx.client_tx_id,
              result: "OK"
            });
          } catch (error) {
            if (isMysqlError(error) && error.errno === MYSQL_DUPLICATE_ERROR_CODE) {
              results.push({
                client_tx_id: tx.client_tx_id,
                result: "DUPLICATE"
              });
              logSyncPushTransactionResult({
                correlationId,
                clientTxId: tx.client_tx_id,
                result: "DUPLICATE"
              });
              continue;
            }

            console.error("POST /sync/push transaction insert failed", {
              correlation_id: correlationId,
              client_tx_id: tx.client_tx_id,
              error
            });
            results.push(toErrorResult(tx.client_tx_id, "insert failed"));
            logSyncPushTransactionResult({
              correlationId,
              clientTxId: tx.client_tx_id,
              result: "ERROR"
            });
          }
        }
      } finally {
        dbConnection.release();
      }

      const response = SyncPushResponseSchema.parse({ results });

      return Response.json(
        {
          ok: true,
          ...response
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      console.error("POST /sync/push failed", {
        correlation_id: correlationId,
        error
      });
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [
    requireRole(["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"]),
    requireOutletAccess((request) => parseOutletIdForGuard(request))
  ]
);
