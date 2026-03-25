// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export type SuccessPayload<T> = {
  success: true;
  data: T;
  error?: never;
};

export type ErrorPayload = {
  success: false;
  data?: never;
  error: {
    code: string;
    message: string;
  };
};

export function successResponse<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400
): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}
