// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
import { sql } from "kysely";
import { AuditService } from "../audit-service.js";
export async function createTestAuditLog(db, opts) {
    const auditService = new AuditService(db);
    const { companyId, userId, action, success, result = success ? "SUCCESS" : "FAIL", payloadJson = success ? '{"test":"success"}' : '{"test":"fail"}', entityType = "setting", entityId = 0, outletId = null, } = opts;
    const context = {
        company_id: companyId,
        user_id: userId,
        outlet_id: outletId,
        ip_address: null,
    };
    let payload;
    try {
        payload = JSON.parse(payloadJson);
    }
    catch {
        payload = { raw: payloadJson };
    }
    // logAction supports arbitrary action strings (e.g. story sentinel values)
    // that logCreate() cannot express. Both are production AuditService methods.
    const status = success ? 1 : 0;
    await auditService.logAction(context, entityType, entityId, action, payload, result, status);
    const idResult = await sql `
    SELECT LAST_INSERT_ID() as id
  `.execute(db);
    return {
        id: Number(idResult.rows[0].id),
    };
}
//# sourceMappingURL=audit-fixtures.js.map