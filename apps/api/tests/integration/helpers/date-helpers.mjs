// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Date helper utilities for integration tests
 * 
 * This module provides pure JavaScript implementations of date utilities
 * to avoid .ts import issues with Node's test runner.
 */

/**
 * Parse YYYY-MM-DD date format
 * @param {string} value - Date string to validate
 * @returns {boolean} true if valid
 */
function isValidDate(value) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;
  
  const date = new Date(value);
  if (isNaN(date.getTime())) return false;
  
  const parts = value.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  return date.getUTCFullYear() === year &&
         date.getUTCMonth() + 1 === month &&
         date.getUTCDate() === day;
}

/**
 * Get timezone offset in hours (e.g., +7 for Asia/Jakarta, -5 for America/New_York)
 * @param {string} timezone - IANA timezone name
 * @returns {number} Offset in hours
 */
function getTimezoneOffsetHours(timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Get the offset by comparing a date in both UTC and the target timezone
  const targetDate = new Date(`2026-03-10T12:00:00Z`);
  const targetParts = formatter.formatToParts(targetDate);
  
  const targetHour = parseInt(targetParts.find(p => p.type === 'hour')?.value || '0', 10);
  const utcHour = 12; // The input was 12:00 UTC
  
  // Calculate offset
  let offsetHours = utcHour - targetHour;
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;
  
  return offsetHours;
}

/**
 * Normalize a date string to UTC start of day in the given timezone
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} timezone - IANA timezone (e.g., "Asia/Jakarta")
 * @param {'start'|'end'} boundary - 'start' for 00:00:00, 'end' for 23:59:59.999
 * @returns {string} UTC ISO string
 */
export function normalizeDate(dateStr, timezone, boundary) {
  if (!isValidDate(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}. Expected: YYYY-MM-DD`);
  }
  
  const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999';
  
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const day = parseInt(dateStr.slice(8, 10), 10);
  const hour = parseInt(time.slice(0, 2), 10);
  const minute = parseInt(time.slice(3, 5), 10);
  const second = parseInt(time.slice(6, 8), 10);
  const millisecond = parseInt(time.slice(9, 12), 10);
  
  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    fractionalSecondDigits: 3
  });
  
  const naiveUTC = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  
  let low = naiveUTC - 14 * 60 * 60 * 1000;
  let high = naiveUTC + 14 * 60 * 60 * 1000;
  
  const getTargetComponents = (utcTimestamp) => {
    const d = new Date(utcTimestamp);
    const parts = targetFormatter.formatToParts(d);
    return {
      year: parseInt(parts.find(p => p.type === 'year')?.value || '0', 10),
      month: parseInt(parts.find(p => p.type === 'month')?.value || '0', 10),
      day: parseInt(parts.find(p => p.type === 'day')?.value || '0', 10),
      hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10),
      minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10),
      second: parseInt(parts.find(p => p.type === 'second')?.value || '0', 10),
      millisecond: parseInt(parts.find(p => p.type === 'fractionalSecond')?.value || '0', 10)
    };
  };
  
  const desiredMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const target = getTargetComponents(mid);
    const targetMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second, target.millisecond);
    
    if (targetMs < desiredMs) {
      low = mid;
    } else if (targetMs > desiredMs) {
      high = mid;
    } else {
      return new Date(mid).toISOString();
    }
  }
  
  const lowTarget = getTargetComponents(low);
  const highTarget = getTargetComponents(high);
  
  const lowMs = Date.UTC(lowTarget.year, lowTarget.month - 1, lowTarget.day, lowTarget.hour, lowTarget.minute, lowTarget.second, lowTarget.millisecond);
  const highMs = Date.UTC(highTarget.year, highTarget.month - 1, highTarget.day, highTarget.hour, highTarget.minute, highTarget.second, highTarget.millisecond);
  
  if (lowMs === desiredMs) return new Date(low).toISOString();
  if (highMs === desiredMs) return new Date(high).toISOString();
  
  const lowDiff = Math.abs(lowMs - desiredMs);
  const highDiff = Math.abs(highMs - desiredMs);
  
  if (lowDiff < highDiff) {
    return new Date(low + (desiredMs - lowMs)).toISOString();
  } else {
    return new Date(high + (desiredMs - highMs)).toISOString();
  }
}