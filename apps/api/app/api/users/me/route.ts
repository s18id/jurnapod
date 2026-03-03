// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { findActiveUserById } from "../../../../src/lib/auth";
import { unauthorizedResponse, withAuth } from "../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../src/lib/response";

export const GET = withAuth(
  async (_request, auth) => {
    try {
      const user = await findActiveUserById(auth.userId, auth.companyId);
      if (!user) {
        return unauthorizedResponse();
      }

      return successResponse(user);
    } catch (error) {
      console.error("GET /api/users/me failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load current user", 500);
    }
  }
);
