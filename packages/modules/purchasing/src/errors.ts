// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing module error classes.
 */

export class PurchasingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchasingConflictError";
  }
}

export class PurchasingReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchasingReferenceError";
  }
}

export class PurchasingForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchasingForbiddenError";
  }
}

export class SupplierHasOpenDocumentsError extends Error {
  readonly code = "SUPPLIER_HAS_OPEN_DOCUMENTS";
  readonly detail: { openDocumentType: string };

  constructor(openDocumentType = "purchase_order") {
    super("Cannot deactivate supplier with open purchase orders");
    this.name = "SupplierHasOpenDocumentsError";
    this.detail = { openDocumentType };
  }
}

export class SupplierNotFoundError extends Error {
  readonly code = "SUPPLIER_NOT_FOUND";

  constructor() {
    super("Supplier not found or access denied");
    this.name = "SupplierNotFoundError";
  }
}
