// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export type WarningPayload = {
  code: string;
  reason: string;
  message: string;
  blocking: false;
};

export type SuccessPayload<T> = {
  success: true;
  data: T;
  error?: never;
  warnings?: WarningPayload[];
};

export type ErrorPayload = {
  success: false;
  data?: never;
  error: {
    code: string;
    message: string;
  };
};

export function successResponse<T>(
  data: T,
  status = 200,
  warnings?: WarningPayload[]
): Response {
  const body: { success: true; data: T; warnings?: WarningPayload[] } = {
    success: true,
    data,
  };
  if (warnings && warnings.length > 0) {
    body.warnings = warnings;
  }
  return Response.json(body, { status });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400
): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}
