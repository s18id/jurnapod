import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import { listRoles } from "../../../src/lib/users";

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Roles request failed"
  }
};

export const GET = withAuth(
  async (_request, _auth) => {
    try {
      const roles = await listRoles();
      return Response.json({ ok: true, roles }, { status: 200 });
    } catch (error) {
      console.error("GET /api/roles failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN"])]
);
