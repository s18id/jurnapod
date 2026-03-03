// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export type SuccessPayload<T> = {
  success: true;
  data: T;
};

export type ErrorPayload = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export function successResponse<T>(data: T, status = 200, headers?: HeadersInit): Response {
  return Response.json({ success: true, data }, { status, headers });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  headers?: HeadersInit
): Response {
  return Response.json({ success: false, error: { code, message } }, { status, headers });
}
