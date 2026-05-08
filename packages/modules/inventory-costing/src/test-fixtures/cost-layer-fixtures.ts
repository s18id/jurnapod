// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { LayerSnapshot } from "../costing-planner.js";

export interface CostLayerFixtureInput {
  id: number;
  quantity: number;
  unitCost: number;
  acquiredAt: string;
}

export function createTestCostLayer(input: CostLayerFixtureInput): LayerSnapshot {
  return {
    id: input.id,
    remainingQty: input.quantity,
    unitCost: input.unitCost,
    acquiredAt: new Date(input.acquiredAt),
  };
}

export function createTestCostLayerSet(layers: CostLayerFixtureInput[]): LayerSnapshot[] {
  return layers.map(createTestCostLayer);
}

export function createTestStandardCostingSetup(standardCost: number) {
  return { standardCost };
}

export function createTestVarianceRecord(
  actualCost: number,
  standardCost: number,
  quantity: number,
) {
  return {
    actualCost,
    standardCost,
    quantity,
  };
}
