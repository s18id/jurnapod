// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { successResponse } from "../../../../src/lib/response";

function outletIdFromRequest(request: Request): number {
  const outletIdRaw = new URL(request.url).searchParams.get("outlet_id");
  if (!outletIdRaw) {
    return 0;
  }

  const outletId = Number(outletIdRaw);
  if (!Number.isSafeInteger(outletId) || outletId <= 0) {
    return 0;
  }

  return outletId;
}

export const GET = withAuth(
  async () => successResponse(null),
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "CASHIER", "ACCOUNTANT"],
      module: "outlets",
      permission: "read",
      outletId: (request) => outletIdFromRequest(request)
    })
  ]
);
