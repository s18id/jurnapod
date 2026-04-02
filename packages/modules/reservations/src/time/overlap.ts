// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservation Overlap Rule
 *
 * This module captures the canonical overlap rule for reservation scheduling.
 *
 * Overlap Rule: a_start < b_end && b_start < a_end
 *
 * This means two reservations overlap if:
 * - Reservation A starts before Reservation B ends, AND
 * - Reservation B starts before Reservation A ends
 *
 * Non-overlap case: end == next start (adjacent reservations do not overlap)
 *
 * @see packages/modules/reservations/src/time/timestamp.ts for timestamp types
 */

/**
 * Check if two time ranges overlap using the canonical overlap rule.
 *
 * Overlap exists when: a_start < b_end && b_start < a_end
 * Non-overlap when: a_end <= b_start OR b_end <= a_start
 *
 * @param aStart - Start timestamp of range A (unix milliseconds)
 * @param aEnd - End timestamp of range A (unix milliseconds)
 * @param bStart - Start timestamp of range B (unix milliseconds)
 * @param bEnd - End timestamp of range B (unix milliseconds)
 * @returns true if the ranges overlap, false otherwise
 *
 * @example
 * // Overlapping reservations
 * reservationsOverlap(
 *   1710587400000,  // A: 10:30
 *   1710591000000,  // A: 11:30
 *   1710589200000,  // B: 11:00
 *   1710592800000   // B: 12:00
 * ) // returns true (overlap from 11:00-11:30)
 *
 * @example
 * // Adjacent reservations (non-overlapping)
 * reservationsOverlap(
 *   1710587400000,  // A: 10:30
 *   1710591000000,  // A: 11:30
 *   1710591000000,  // B: 11:30 (starts when A ends)
 *   1710594600000   // B: 12:30
 * ) // returns false (end == next start is non-overlap)
 */
export function reservationsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Check if a time range overlaps with a list of existing time ranges
 *
 * @param newStart - Start timestamp of the new reservation range
 * @param newEnd - End timestamp of the new reservation range
 * @param existingRanges - Array of existing {start, end} ranges
 * @returns true if any overlap exists, false otherwise
 */
export function hasOverlap(
  newStart: number,
  newEnd: number,
  existingRanges: Array<{ start: number; end: number }>
): boolean {
  return existingRanges.some((range) => reservationsOverlap(newStart, newEnd, range.start, range.end));
}

/**
 * Find all overlapping ranges from a list
 *
 * @param newStart - Start timestamp of the new reservation range
 * @param newEnd - End timestamp of the new reservation range
 * @param existingRanges - Array of existing {start, end} ranges
 * @returns Array of ranges that overlap with the new range
 */
export function findOverlappingRanges(
  newStart: number,
  newEnd: number,
  existingRanges: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  return existingRanges.filter((range) => reservationsOverlap(newStart, newEnd, range.start, range.end));
}

/**
 * Validate that a time range is well-formed
 * A valid range has a positive duration (end > start)
 *
 * @param start - Start timestamp
 * @param end - End timestamp
 * @returns true if valid, false otherwise
 */
export function isValidRange(start: number, end: number): boolean {
  return end > start;
}
