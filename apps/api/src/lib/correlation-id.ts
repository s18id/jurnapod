// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { randomUUID } from "node:crypto";

export function getRequestCorrelationId(request: Request): string {
  const headerValue =
    request.headers.get("x-correlation-id")?.trim() ?? request.headers.get("x-request-id")?.trim();

  if (!headerValue || headerValue.length === 0) {
    return randomUUID();
  }

  return headerValue;
}
