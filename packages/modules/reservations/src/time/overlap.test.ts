// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for the time model's overlap rule
 * @module
 */

import { describe, it } from "node:test";
import assert from "node:assert";

import {
  reservationsOverlap,
  hasOverlap,
  findOverlappingRanges,
  isValidRange,
} from "./overlap.js";

describe("reservationsOverlap", () => {
  it("returns true when ranges overlap (partial overlap at start)", () => {
    // Range A: 10:30-11:30, Range B: 11:00-12:00
    // Overlap: 11:00-11:30
    const result = reservationsOverlap(
      1710587400000, // A: 10:30
      1710591000000, // A: 11:30
      1710589200000, // B: 11:00
      1710592800000 // B: 12:00
    );
    assert.strictEqual(result, true);
  });

  it("returns true when ranges overlap (B inside A)", () => {
    // Range A: 10:00-12:00, Range B: 10:30-11:30
    const result = reservationsOverlap(
      1710585600000, // A: 10:00
      1710592800000, // A: 12:00
      1710587400000, // B: 10:30
      1710591000000 // B: 11:30
    );
    assert.strictEqual(result, true);
  });

  it("returns true when ranges overlap (A inside B)", () => {
    // Range A: 10:30-11:30, Range B: 10:00-12:00
    const result = reservationsOverlap(
      1710587400000, // A: 10:30
      1710591000000, // A: 11:30
      1710585600000, // B: 10:00
      1710592800000 // B: 12:00
    );
    assert.strictEqual(result, true);
  });

  it("returns true when ranges overlap (exact same times)", () => {
    // Range A: 10:30-11:30, Range B: 10:30-11:30
    const result = reservationsOverlap(
      1710587400000, // A: 10:30
      1710591000000, // A: 11:30
      1710587400000, // B: 10:30
      1710591000000 // B: 11:30
    );
    assert.strictEqual(result, true);
  });

  it("returns false when ranges do not overlap (B after A)", () => {
    // Range A: 10:30-11:30, Range B: 11:30-12:30
    // end == next start is NON-overlap
    const result = reservationsOverlap(
      1710587400000, // A: 10:30
      1710591000000, // A: 11:30
      1710591000000, // B: 11:30 (starts when A ends)
      1710594600000 // B: 12:30
    );
    assert.strictEqual(result, false);
  });

  it("returns false when ranges do not overlap (A after B)", () => {
    // Range A: 11:30-12:30, Range B: 10:30-11:30
    // end == next start is NON-overlap
    const result = reservationsOverlap(
      1710591000000, // A: 11:30
      1710594600000, // A: 12:30
      1710587400000, // B: 10:30
      1710591000000 // B: 11:30
    );
    assert.strictEqual(result, false);
  });

  it("returns false when ranges do not overlap (B far after A)", () => {
    // Range A: 10:00-10:30, Range B: 11:00-11:30
    const result = reservationsOverlap(
      1710585600000, // A: 10:00
      1710587400000, // A: 10:30
      1710590400000, // B: 11:00
      1710592200000 // B: 11:30
    );
    assert.strictEqual(result, false);
  });

  it("returns false when ranges do not overlap (A far after B)", () => {
    // Range A: 11:00-11:30, Range B: 10:00-10:30
    const result = reservationsOverlap(
      1710590400000, // A: 11:00
      1710592200000, // A: 11:30
      1710585600000, // B: 10:00
      1710587400000 // B: 10:30
    );
    assert.strictEqual(result, false);
  });
});

describe("hasOverlap", () => {
  it("returns true when new range overlaps with any existing range", () => {
    const existingRanges = [
      { start: 1710585600000, end: 1710589200000 }, // 10:00-11:00
      { start: 1710590400000, end: 1710594000000 }, // 11:00-12:00
    ];
    // new: 11:30-12:30 overlaps with second range (11:00-12:00)
    const result = hasOverlap(
      1710592200000, // new: 11:30
      1710595800000, // new: 12:30
      existingRanges
    );
    assert.strictEqual(result, true);
  });

  it("returns false when new range does not overlap with any existing range", () => {
    const existingRanges = [
      { start: 1710585600000, end: 1710587400000 }, // 10:00-10:30
      { start: 1710590400000, end: 1710592200000 }, // 11:00-11:30
    ];
    // new: 10:40-10:50 does not overlap with either (gap between ranges)
    const result = hasOverlap(
      1710588000000, // new: 10:40
      1710588600000, // new: 10:50
      existingRanges
    );
    assert.strictEqual(result, false);
  });

  it("returns false for empty existing ranges", () => {
    const result = hasOverlap(
      1710587400000,
      1710589200000,
      []
    );
    assert.strictEqual(result, false);
  });
});

describe("findOverlappingRanges", () => {
  it("returns all overlapping ranges", () => {
    const existingRanges = [
      { start: 1710585600000, end: 1710589200000 }, // 10:00-11:00 (overlaps)
      { start: 1710588000000, end: 1710591000000 }, // 10:40-11:30 (overlaps)
      { start: 1710590400000, end: 1710592200000 }, // 11:00-11:30 (overlaps)
      { start: 1710594000000, end: 1710595800000 }, // 12:00-12:30 (no overlap)
    ];
    // new: 10:30-11:30 overlaps with first 3 ranges
    const result = findOverlappingRanges(
      1710587400000, // new: 10:30
      1710591000000, // new: 11:30
      existingRanges
    );
    assert.strictEqual(result.length, 3);
  });

  it("returns empty array when no overlaps", () => {
    const existingRanges = [
      { start: 1710594000000, end: 1710595800000 }, // 12:00-12:30
    ];
    const result = findOverlappingRanges(
      1710587400000, // new: 10:30
      1710589200000, // new: 11:00
      existingRanges
    );
    assert.strictEqual(result.length, 0);
  });
});

describe("isValidRange", () => {
  it("returns true when end > start", () => {
    assert.strictEqual(isValidRange(1710587400000, 1710591000000), true);
  });

  it("returns false when end == start (zero duration)", () => {
    assert.strictEqual(isValidRange(1710587400000, 1710587400000), false);
  });

  it("returns false when end < start (invalid range)", () => {
    assert.strictEqual(isValidRange(1710591000000, 1710587400000), false);
  });
});
