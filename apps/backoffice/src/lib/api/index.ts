// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Public API surface for typed client and compatibility exports.
//
// New typed client:
//   import { api } from "@/lib/api";
//   const { data, error } = await api.GET("/users", { params: { query: { ... } } });
//
// Legacy compat (preserved):
//   import { apiRequest, ApiError } from "@/lib/api";
//   const data = await apiRequest<MyType>("/users", { method: "GET" });

export { api, createTypedClient, ApiError, signOut } from "./client";
export type { paths } from "./client";

// Re-export legacy API client functions for transitional compatibility.
// Existing code importing from @/lib/api-client continues to work unchanged.
export {
  apiRequest,
  apiStreamingRequest,
  uploadWithProgress,
  applyWithProgress,
  resolveToken,
} from "@/lib/api-client";

export type {
  ApiRequestOptions,
  UploadProgressCallback,
  ApplyProgressCallback,
} from "@/lib/api-client";
