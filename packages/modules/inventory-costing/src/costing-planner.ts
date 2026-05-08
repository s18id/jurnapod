// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  CostTrackingError,
  fromMinorUnits,
  InsufficientInventoryError,
  toMinorUnits,
  type ConsumedLayer,
} from "./types/costing.js";

export interface LayerSnapshot {
  id: number;
  acquiredAt: Date;
  remainingQty: number;
  unitCost: number;
}

export interface LayerConsumptionPlan {
  totalCost: number;
  consumedLayers: ConsumedLayer[];
  remainingByLayer: Map<number, number>;
}

type LayerMethod = "FIFO" | "LIFO";

function sortByMethod(layers: LayerSnapshot[], method: LayerMethod): LayerSnapshot[] {
  if (method === "FIFO") {
    return [...layers].sort((a, b) => {
      const tsDiff = a.acquiredAt.getTime() - b.acquiredAt.getTime();
      return tsDiff !== 0 ? tsDiff : a.id - b.id;
    });
  }

  return [...layers].sort((a, b) => {
    const tsDiff = b.acquiredAt.getTime() - a.acquiredAt.getTime();
    return tsDiff !== 0 ? tsDiff : b.id - a.id;
  });
}

export function planLayerConsumption(
  layers: LayerSnapshot[],
  quantity: number,
  method: LayerMethod,
): LayerConsumptionPlan {
  if (quantity <= 0) {
    throw new CostTrackingError(`Invalid quantity: ${quantity}. Must be positive.`);
  }

  const activeLayers = layers.filter((layer) => layer.remainingQty > 0);
  const sortedLayers = sortByMethod(activeLayers, method);
  const totalAvailable = sortedLayers.reduce((sum, layer) => sum + layer.remainingQty, 0);

  if (totalAvailable < quantity) {
    throw new InsufficientInventoryError(quantity, totalAvailable);
  }

  let remainingToConsume = quantity;
  let totalCostMinor = 0;
  const consumedLayers: ConsumedLayer[] = [];
  const remainingByLayer = new Map<number, number>();

  for (const layer of sortedLayers) {
    if (remainingToConsume <= 0) {
      remainingByLayer.set(layer.id, layer.remainingQty);
      continue;
    }

    const consumeFromLayer = Math.min(remainingToConsume, layer.remainingQty);
    const nextRemaining = layer.remainingQty - consumeFromLayer;
    remainingByLayer.set(layer.id, nextRemaining);

    if (consumeFromLayer > 0) {
      consumedLayers.push({
        layerId: layer.id,
        consumedQty: consumeFromLayer,
        unitCost: layer.unitCost,
      });

      totalCostMinor += toMinorUnits(layer.unitCost) * consumeFromLayer;
      remainingToConsume -= consumeFromLayer;
    }
  }

  return {
    totalCost: fromMinorUnits(totalCostMinor),
    consumedLayers,
    remainingByLayer,
  };
}

export interface AverageDeductionPlanInput {
  availableQty: number;
  quantity: number;
  currentAvgCost: number;
  totalLayersCost: number;
}

export interface AverageDeductionPlan {
  totalCost: number;
  newQty: number;
  newTotalCost: number;
  newAvgCost: number;
}

export function planAverageDeduction(input: AverageDeductionPlanInput): AverageDeductionPlan {
  if (input.quantity <= 0) {
    throw new CostTrackingError(`Invalid quantity: ${input.quantity}. Must be positive.`);
  }

  if (input.availableQty < input.quantity) {
    throw new InsufficientInventoryError(input.quantity, input.availableQty);
  }

  const totalCost = fromMinorUnits(toMinorUnits(input.currentAvgCost) * input.quantity);
  const newQty = input.availableQty - input.quantity;
  const newTotalCost = input.totalLayersCost - totalCost;
  const newAvgCost = newQty > 0 ? newTotalCost / newQty : 0;

  return {
    totalCost,
    newQty,
    newTotalCost,
    newAvgCost,
  };
}
