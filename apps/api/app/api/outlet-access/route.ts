import {
  requireOutletAccess,
  requireRole,
  withAuth
} from "../../../src/lib/auth-guard";

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
  async () => Response.json({ ok: true }, { status: 200 }),
  [
    requireRole(["OWNER", "ADMIN", "CASHIER", "ACCOUNTANT"]),
    requireOutletAccess((request) => outletIdFromRequest(request))
  ]
);
