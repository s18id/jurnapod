// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { successResponse } from "../../../src/lib/response";

export async function GET() {
  return successResponse({ service: "jurnapod-api" });
}
