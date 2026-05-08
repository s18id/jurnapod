import { describe, expect, it } from "vitest";

import {
  calculateStandardVariance,
  parseStandardVarianceAccountId,
  resolveStandardVarianceAccountId,
  STANDARD_VARIANCE_ACCOUNT_SETTING_KEY,
} from "../../src/index.js";
import { createTestStandardCostingSetup, createTestVarianceRecord } from "../../src/test-fixtures/index.js";

describe("standard costing variance", () => {
  it("AC6: records unfavorable variance when actual > standard", () => {
    const result = calculateStandardVariance({
      quantity: 10,
      standardUnitCost: 9,
      actualUnitCost: 11,
      varianceAccountId: 999,
    });

    expect(result.standardTotalCost).toBe(90);
    expect(result.actualTotalCost).toBe(110);
    expect(result.varianceAmount).toBe(20);
    expect(result.direction).toBe("UNFAVORABLE");
    expect(result.varianceAccountId).toBe(999);
  });

  it("AC6: records favorable variance when actual < standard", () => {
    const result = calculateStandardVariance({
      quantity: 4,
      standardUnitCost: 15,
      actualUnitCost: 14,
      varianceAccountId: 321,
    });

    expect(result.standardTotalCost).toBe(60);
    expect(result.actualTotalCost).toBe(56);
    expect(result.varianceAmount).toBe(-4);
    expect(result.direction).toBe("FAVORABLE");
  });

  it("throws explicit error when company variance account setting is missing", () => {
    expect(() => parseStandardVarianceAccountId(null)).toThrow(
      `Missing required setting '${STANDARD_VARIANCE_ACCOUNT_SETTING_KEY}'`,
    );
  });

  it("rejects invalid variance account edge values", () => {
    expect(() => parseStandardVarianceAccountId(0)).toThrow("expected a positive integer account ID");
    expect(() => parseStandardVarianceAccountId(-1)).toThrow("expected a positive integer account ID");
    expect(() => parseStandardVarianceAccountId("abc")).toThrow("expected a positive integer account ID");
    expect(() => parseStandardVarianceAccountId("")).toThrow(
      `Missing required setting '${STANDARD_VARIANCE_ACCOUNT_SETTING_KEY}'`,
    );
  });

  it("rejects negative actual or standard unit costs", () => {
    expect(() =>
      calculateStandardVariance({
        quantity: 2,
        standardUnitCost: -1,
        actualUnitCost: 5,
        varianceAccountId: 100,
      }),
    ).toThrow("Invalid standard unit cost");

    expect(() =>
      calculateStandardVariance({
        quantity: 2,
        standardUnitCost: 5,
        actualUnitCost: -1,
        varianceAccountId: 100,
      }),
    ).toThrow("Invalid actual unit cost");
  });

  it("resolves company-level variance account ID from settings port", async () => {
    const settingsPort = {
      resolve: async () => "123",
      get: async () => {
        throw new Error("not used");
      },
      getMany: async () => {
        throw new Error("not used");
      },
    };

    const accountId = await resolveStandardVarianceAccountId(1, settingsPort);
    expect(accountId).toBe(123);
  });

  it("fixture helpers produce deterministic standard-cost variance inputs", () => {
    const setup = createTestStandardCostingSetup(10);
    const input = createTestVarianceRecord(12, setup.standardCost, 3);

    const result = calculateStandardVariance({
      quantity: input.quantity,
      actualUnitCost: input.actualCost,
      standardUnitCost: input.standardCost,
      varianceAccountId: 501,
    });

    expect(result.varianceAmount).toBe(6);
    expect(result.direction).toBe("UNFAVORABLE");
  });
});
