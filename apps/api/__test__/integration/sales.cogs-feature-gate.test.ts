// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from 'vitest';
import { parseFeatureGateValue } from "../../src/lib/shared/common-utils";

describe("sales COGS feature gate", () => {
  test("parseFeatureGateValue handles int and boolean variants", () => {

    assert.equal(parseFeatureGateValue(1), true);
    assert.equal(parseFeatureGateValue(true), true);
    assert.equal(parseFeatureGateValue("1"), true);
    assert.equal(parseFeatureGateValue("true"), true);

    assert.equal(parseFeatureGateValue(0), false);
    assert.equal(parseFeatureGateValue(false), false);
    assert.equal(parseFeatureGateValue("0"), false);
    assert.equal(parseFeatureGateValue("false"), false);
  });

  test("parseFeatureGateValue treats invalid values as disabled", () => {
    assert.equal(parseFeatureGateValue("yes"), false);
    assert.equal(parseFeatureGateValue(2), false);
    assert.equal(parseFeatureGateValue(null), false);
    assert.equal(parseFeatureGateValue(undefined), false);
    assert.equal(parseFeatureGateValue({}), false);
  });
});
