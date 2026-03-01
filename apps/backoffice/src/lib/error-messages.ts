// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export const ERROR_MESSAGES = {
  NETWORK_ERROR: "Unable to connect. Your transaction is saved and will sync when online.",
  CONFLICT: "Data changed while offline. Please review and resolve conflicts.",
  VALIDATION_ERROR: "Invalid data. Please check your entries.",
  SERVER_ERROR: "Server error. Your transaction is saved and will retry automatically.",
  MAX_RETRIES: "Failed to sync after 3 attempts. Please check the transaction and try again."
} as const;
