// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  createRefreshTokenClearCookie,
  readRefreshTokenFromRequest,
  revokeRefreshToken
} from "../../../../src/lib/refresh-tokens";
import { successResponse } from "../../../../src/lib/response";

export async function POST(request: Request) {
  const refreshToken = readRefreshTokenFromRequest(request);
  if (refreshToken) {
    try {
      await revokeRefreshToken(refreshToken);
    } catch (error) {
      console.error("POST /auth/logout revoke failed", error);
    }
  }

  const response = successResponse(null);
  response.headers.set("Set-Cookie", createRefreshTokenClearCookie());
  return response;
}
