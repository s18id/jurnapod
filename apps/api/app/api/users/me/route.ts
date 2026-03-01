// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { findActiveUserById } from "../../../../src/lib/auth";
import { unauthorizedResponse, withAuth } from "../../../../src/lib/auth-guard";

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Failed to load current user"
  }
};

export const GET = withAuth(
  async (_request, auth) => {
    try {
      const user = await findActiveUserById(auth.userId, auth.companyId);
      if (!user) {
        return unauthorizedResponse();
      }

      return Response.json({ ok: true, user }, { status: 200 });
    } catch (error) {
      console.error("GET /api/users/me failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  }
);
