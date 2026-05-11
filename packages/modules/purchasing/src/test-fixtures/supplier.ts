// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { KyselySchema } from "@jurnapod/db";
import type { SupplierFixture } from "./types.js";
import { SupplierService } from "../services/supplier-service.js";

/**
 * Create a deterministic supplier fixture through the production SupplierService.
 *
 * This fixture is Full Fixture Mode — it uses SupplierService.createSupplier()
 * with full production validation (unique code, required fields).
 *
 * @param db - KyselySchema database instance (injected into SupplierService)
 * @param options - Supplier options (userId defaults to 0 for test seeding)
 * @returns Supplier fixture
 */
export async function createSupplierFixture(
  db: KyselySchema,
  options: {
    companyId: number;
    code?: string;
    name?: string;
    currency?: string;
    isActive?: boolean;
    paymentTermsDays?: number;
    userId?: number;
  }
): Promise<SupplierFixture> {
  const service = new SupplierService(db);
  const code = options.code ?? `TEST-SUP-${Date.now()}`;
  const result = await service.createSupplier({
    companyId: options.companyId,
    userId: options.userId ?? 0,
    payload: {
      code: code.slice(0, 20).toUpperCase(),
      name: options.name ?? `Test Supplier ${code}`,
      currency: options.currency ?? "IDR",
      credit_limit: "0",
      payment_terms_days: options.paymentTermsDays ?? null,
    },
  });

  // Handle inactive supplier: create active first, then update
  if (options.isActive === false) {
    await service.updateSupplier({
      companyId: options.companyId,
      userId: options.userId ?? 0,
      supplierId: result.id,
      payload: { is_active: false },
    });
  }
  return {
    id: result.id,
    company_id: result.company_id,
    code: result.code,
    name: result.name,
    currency: result.currency,
    payment_terms_days: result.payment_terms_days ?? null,
    is_active: result.is_active,
  };
}

/**
 * Set supplier active status for tests validating posting safeguards.
 * Uses the production SupplierService to update via the production path.
 *
 * @param db - KyselySchema database instance
 * @param companyId - Company ID
 * @param supplierId - Supplier ID  
 * @param isActive - Active status to set
 */
export async function setSupplierActiveFixture(
  db: KyselySchema,
  companyId: number,
  supplierId: number,
  isActive: boolean
): Promise<void> {
  const service = new SupplierService(db);
  await service.updateSupplier({
    companyId,
    userId: 0,
    supplierId,
    payload: { is_active: isActive },
  });
}
