// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { importAccountingCsv, parseImportFiles } from "../../../../src/lib/accounting-import";

function isFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const form = await request.formData();
      const accountsFile = form.get("accounts");
      const transactionsFile = form.get("transactions");
      const allocationsFile = form.get("allocations");

      if (!isFile(accountsFile) || !isFile(transactionsFile) || !isFile(allocationsFile)) {
        return Response.json({ ok: false, error: { code: "INVALID_REQUEST", message: "Missing files" } }, { status: 400 });
      }

      const [accountsText, transactionsText, allocationsText] = await Promise.all([
        accountsFile.text(),
        transactionsFile.text(),
        allocationsFile.text()
      ]);
      const parsed = parseImportFiles({
        accountsFileName: accountsFile.name,
        accountsText,
        transactionsFileName: transactionsFile.name,
        transactionsText,
        allocationsFileName: allocationsFile.name,
        allocationsText
      });

      const result = await importAccountingCsv({
        companyId: auth.companyId,
        userId: auth.userId,
        ...parsed
      });

      return Response.json(
        {
          ok: true,
          import_id: result.importId,
          duplicate: result.duplicate,
          totals: result.totals
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("POST /api/accounts/imports failed", error);
      return Response.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Invalid request" } },
        { status: 400 }
      );
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "create" })]
);
