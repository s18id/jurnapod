// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { CostTrackingError, fromMinorUnits, toMinorUnits } from "./types/costing.js";

export const STANDARD_VARIANCE_ACCOUNT_SETTING_KEY = "inventory.standard_variance_account_id";

export type StandardVarianceDirection = "FAVORABLE" | "UNFAVORABLE" | "NONE";

export interface StandardVarianceInput {
  quantity: number;
  standardUnitCost: number;
  actualUnitCost: number;
  varianceAccountId: number;
}

export interface StandardVarianceResult {
  quantity: number;
  standardUnitCost: number;
  actualUnitCost: number;
  standardTotalCost: number;
  actualTotalCost: number;
  varianceAmount: number;
  direction: StandardVarianceDirection;
  varianceAccountId: number;
}

export function resolveVarianceDirection(varianceAmount: number): StandardVarianceDirection {
  if (varianceAmount < 0) {
    return "FAVORABLE";
  }
  if (varianceAmount > 0) {
    return "UNFAVORABLE";
  }
  return "NONE";
}

export function calculateStandardVariance(input: StandardVarianceInput): StandardVarianceResult {
  if (input.quantity <= 0) {
    throw new CostTrackingError(`Invalid quantity for standard variance: ${input.quantity}`);
  }

  if (input.standardUnitCost < 0) {
    throw new CostTrackingError(`Invalid standard unit cost: ${input.standardUnitCost}. Must be non-negative.`);
  }

  if (input.actualUnitCost < 0) {
    throw new CostTrackingError(`Invalid actual unit cost: ${input.actualUnitCost}. Must be non-negative.`);
  }

  const standardTotalCost = fromMinorUnits(toMinorUnits(input.standardUnitCost) * input.quantity);
  const actualTotalCost = fromMinorUnits(toMinorUnits(input.actualUnitCost) * input.quantity);
  const varianceAmount = actualTotalCost - standardTotalCost;

  return {
    quantity: input.quantity,
    standardUnitCost: input.standardUnitCost,
    actualUnitCost: input.actualUnitCost,
    standardTotalCost,
    actualTotalCost,
    varianceAmount,
    direction: resolveVarianceDirection(varianceAmount),
    varianceAccountId: input.varianceAccountId,
  };
}

export function parseStandardVarianceAccountId(value: unknown, key: string = STANDARD_VARIANCE_ACCOUNT_SETTING_KEY): number {
  if (value == null || value === "") {
    throw new CostTrackingError(
      `Missing required setting '${key}'. Configure a company-level standard variance account ID.`,
    );
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CostTrackingError(
      `Invalid setting '${key}': expected a positive integer account ID, received '${String(value)}'.`,
    );
  }

  return parsed;
}
