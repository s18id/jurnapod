import { describe, expect, it } from "vitest";

import { planAverageDeduction, planLayerConsumption } from "../../src/costing-planner.js";
import { createTestCostLayerSet } from "../../src/test-fixtures/index.js";

describe("costing methods deterministic proof", () => {
  it("AC1: FIFO consumes oldest layers first", () => {
    const layers = createTestCostLayerSet([
      { id: 1, quantity: 5, unitCost: 10, acquiredAt: "2026-01-01T00:00:00.000Z" },
      { id: 2, quantity: 5, unitCost: 12, acquiredAt: "2026-01-02T00:00:00.000Z" },
    ]);

    const result = planLayerConsumption(layers, 6, "FIFO");

    expect(result.consumedLayers).toEqual([
      { layerId: 1, consumedQty: 5, unitCost: 10 },
      { layerId: 2, consumedQty: 1, unitCost: 12 },
    ]);
    expect(result.totalCost).toBe(62);
  });

  it("AC2: AVG uses weighted average at deduction time", () => {
    const result = planAverageDeduction({
      availableQty: 10,
      quantity: 4,
      currentAvgCost: 11.5,
      totalLayersCost: 115,
    });

    expect(result.totalCost).toBe(46);
    expect(result.newQty).toBe(6);
    expect(result.newTotalCost).toBe(69);
    expect(result.newAvgCost).toBe(11.5);
  });

  it("AC3+AC4: LIFO consumes newest layers first (reverse chronological)", () => {
    const layers = createTestCostLayerSet([
      { id: 1, quantity: 5, unitCost: 10, acquiredAt: "2026-01-01T00:00:00.000Z" },
      { id: 2, quantity: 5, unitCost: 12, acquiredAt: "2026-01-03T00:00:00.000Z" },
      { id: 3, quantity: 5, unitCost: 11, acquiredAt: "2026-01-02T00:00:00.000Z" },
    ]);

    const result = planLayerConsumption(layers, 7, "LIFO");

    expect(result.consumedLayers).toEqual([
      { layerId: 2, consumedQty: 5, unitCost: 12 },
      { layerId: 3, consumedQty: 2, unitCost: 11 },
    ]);
    expect(result.totalCost).toBe(82);
  });

  it("AC5: partial consumption carries remaining quantity to next layer", () => {
    const layers = createTestCostLayerSet([
      { id: 10, quantity: 3, unitCost: 8, acquiredAt: "2026-01-01T00:00:00.000Z" },
      { id: 11, quantity: 7, unitCost: 9, acquiredAt: "2026-01-02T00:00:00.000Z" },
    ]);

    const result = planLayerConsumption(layers, 5, "FIFO");

    expect(result.consumedLayers).toEqual([
      { layerId: 10, consumedQty: 3, unitCost: 8 },
      { layerId: 11, consumedQty: 2, unitCost: 9 },
    ]);
    expect(result.remainingByLayer.get(10)).toBe(0);
    expect(result.remainingByLayer.get(11)).toBe(5);
    expect(result.totalCost).toBe(42);
  });

  it("ignores zero-remaining layers when planning consumption", () => {
    const layers = createTestCostLayerSet([
      { id: 20, quantity: 0, unitCost: 99, acquiredAt: "2026-01-01T00:00:00.000Z" },
      { id: 21, quantity: 4, unitCost: 5, acquiredAt: "2026-01-02T00:00:00.000Z" },
    ]);

    const result = planLayerConsumption(layers, 3, "FIFO");
    expect(result.consumedLayers).toEqual([{ layerId: 21, consumedQty: 3, unitCost: 5 }]);
    expect(result.remainingByLayer.has(20)).toBe(false);
    expect(result.remainingByLayer.get(21)).toBe(1);
  });

  it("rejects non-positive deduction quantity for planning functions", () => {
    expect(() => planAverageDeduction({ availableQty: 5, quantity: 0, currentAvgCost: 10, totalLayersCost: 50 })).toThrow(
      "Invalid quantity",
    );
    expect(() => planLayerConsumption([], 0, "FIFO")).toThrow("Invalid quantity");
  });
});
