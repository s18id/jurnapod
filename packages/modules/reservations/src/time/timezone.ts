// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Timezone Resolution Policy for Reservations
 *
 * This module implements the canonical timezone resolution order:
 * 1. outlet.timezone (if present and valid)
 * 2. company.timezone (if present and valid)
 * 3. NO UTC fallback - throw error if neither is available
 *
 * @see packages/db/src/kysely/schema.ts for database column definitions
 * @see packages/shared/src/schemas/outlets.ts for OutletFullResponse schema
 * @see packages/shared/src/schemas/companies.ts for CompanyResponse schema
 */

import { Temporal } from "@js-temporal/polyfill";
import { isValidTimeZone } from "@jurnapod/shared";

/**
 * Timezone resolution context
 * Contains timezone information from outlet and company
 */
export interface TimezoneContext {
  /** IANA timezone from outlet (preferred) */
  outletTimezone: string | null;
  /** IANA timezone from company (fallback) */
  companyTimezone: string | null;
}

/**
 * Error thrown when timezone cannot be resolved
 */
export class TimezoneResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimezoneResolutionError";
  }
}

/**
 * Resolve the canonical IANA timezone for reservation operations.
 *
 * Resolution order:
 * 1. outlet.timezone (if present and valid IANA identifier)
 * 2. company.timezone (if present and valid IANA identifier)
 * 3. NO UTC fallback - throws TimezoneResolutionError
 *
 * @param context - Timezone context with outlet and company timezones
 * @returns Resolved IANA timezone string
 * @throws TimezoneResolutionError if no valid timezone can be found
 *
 * @example
 * // Outlet timezone takes precedence
 * resolveTimezone({ outletTimezone: "Asia/Jakarta", companyTimezone: "UTC" })
 * // returns "Asia/Jakarta"
 *
 * @example
 * // Company timezone fallback when outlet is missing
 * resolveTimezone({ outletTimezone: null, companyTimezone: "Asia/Jakarta" })
 * // returns "Asia/Jakarta"
 *
 * @example
 * // Throws when both are missing/invalid
 * resolveTimezone({ outletTimezone: null, companyTimezone: null })
 * // throws TimezoneResolutionError
 */
export function resolveTimezone(context: TimezoneContext): string {
  // Try outlet timezone first
  if (context.outletTimezone && isValidTimeZone(context.outletTimezone)) {
    return context.outletTimezone;
  }

  // Fall back to company timezone
  if (context.companyTimezone && isValidTimeZone(context.companyTimezone)) {
    return context.companyTimezone;
  }

  // NO UTC fallback - this is intentional per project invariants
  throw new TimezoneResolutionError(
    `Cannot resolve timezone: outlet="${context.outletTimezone ?? "null"}, company="${context.companyTimezone ?? "null"}". ` +
      "Neither outlet nor company timezone is set or valid. " +
      "No UTC fallback is permitted per reservation timezone policy."
  );
}

/**
 * Resolve timezone with optional outlet timezone
 * Convenience function when outlet object may be null
 *
 * @param outletTimezone - IANA timezone string from outlet or null
 * @param companyTimezone - IANA timezone string from company (required fallback)
 * @returns Resolved IANA timezone string
 * @throws TimezoneResolutionError if company timezone is missing/invalid
 */
export function resolveTimezoneFromOutletAndCompany(
  outletTimezone: string | null | undefined,
  companyTimezone: string | null | undefined
): string {
  return resolveTimezone({
    outletTimezone: outletTimezone ?? null,
    companyTimezone: companyTimezone ?? null,
  });
}

/**
 * Convert a business-local datetime in YYYY-MM-DD HH:mm:ss format to a UTC instant
 *
 * @param dateStr - Business-local date in YYYY-MM-DD format
 * @param timeStr - Business-local time in HH:mm:ss format
 * @param timezone - IANA timezone for the business
 * @returns UTC ISO instant string
 */
export function businessLocalToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string
): string {
  if (!isValidTimeZone(timezone)) {
    throw new TimezoneResolutionError(`Invalid timezone: ${timezone}`);
  }

  const dateTimeStr = `${dateStr}T${timeStr}`;
  const zdt = Temporal.ZonedDateTime.from(`${dateTimeStr}[${timezone}]`, {
    overflow: "reject",
  });

  return zdt.toInstant().toString();
}

/**
 * Convert a UTC instant to business-local date and time components
 *
 * @param utcInstant - UTC ISO instant string
 * @param timezone - IANA timezone for the business
 * @returns Business-local date and time strings
 */
export function utcToBusinessLocal(
  utcInstant: string,
  timezone: string
): { date: string; time: string } {
  if (!isValidTimeZone(timezone)) {
    throw new TimezoneResolutionError(`Invalid timezone: ${timezone}`);
  }

  const instant = Temporal.Instant.from(utcInstant);
  const zdt = instant.toZonedDateTimeISO(timezone);

  const year = String(zdt.year).padStart(4, "0");
  const month = String(zdt.month).padStart(2, "0");
  const day = String(zdt.day).padStart(2, "0");
  const hour = String(zdt.hour).padStart(2, "0");
  const minute = String(zdt.minute).padStart(2, "0");
  const second = String(zdt.second).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
  };
}

/**
 * Get current instant in a given timezone
 *
 * @param timezone - IANA timezone
 * @returns Current UTC instant
 */
export function nowInTimezone(timezone: string): Temporal.Instant {
  if (!isValidTimeZone(timezone)) {
    throw new TimezoneResolutionError(`Invalid timezone: ${timezone}`);
  }
  return Temporal.Now.instant().toZonedDateTimeISO(timezone).toInstant();
}
