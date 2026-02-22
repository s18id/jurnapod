import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { importAccountingCsv, parseImportFiles } from "../../../../src/lib/accounting-import";

function isFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const form = await request.formData();
      const daFile = form.get("da");
      const trnsFile = form.get("trns");
      const alkFile = form.get("alk");

      if (!isFile(daFile) || !isFile(trnsFile) || !isFile(alkFile)) {
        return Response.json({ ok: false, error: { code: "INVALID_REQUEST", message: "Missing files" } }, { status: 400 });
      }

      const [daText, trnsText, alkText] = await Promise.all([daFile.text(), trnsFile.text(), alkFile.text()]);
      const parsed = parseImportFiles({
        daFileName: daFile.name,
        daText,
        trnsFileName: trnsFile.name,
        trnsText,
        alkFileName: alkFile.name,
        alkText
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
      console.error("POST /accounting/imports failed", error);
      return Response.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Invalid request" } },
        { status: 400 }
      );
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
