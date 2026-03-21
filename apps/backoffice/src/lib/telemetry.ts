// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Telemetry tracking utilities for backoffice UI.
 * 
 * In production, this can be swapped for:
 * - Segment, Amplitude, Mixpanel
 * - Custom backend endpoint
 * - Google Analytics, Matomo, etc.
 * 
 * Currently logs to console for development.
 */

export interface TelemetryEvent {
  event: string;
  page: string;
  actorRole: string;
  outcome: "success" | "error";
  actionName?: string;
  errorMessage?: string;
  timestamp: number;
}

type TelemetryEventHandler = (event: TelemetryEvent) => void;

let eventHandler: TelemetryEventHandler = (event) => {
  // Default: console logging for development
  // Override with setTelemetryHandler for production
  console.log("[Telemetry]", JSON.stringify(event));
};

/**
 * Set a custom telemetry handler for production use.
 * Example: setTelemetryHandler((event) => fetch('/api/telemetry', { body: JSON.stringify(event) }))
 */
export function setTelemetryHandler(handler: TelemetryEventHandler): void {
  eventHandler = handler;
}

/**
 * Track a telemetry event.
 */
export function trackEvent(event: Omit<TelemetryEvent, "timestamp">): void {
  eventHandler({
    ...event,
    timestamp: Date.now(),
  });
}

/**
 * Track when a user opens an action menu.
 */
export function trackActionMenuOpen(page: string, actorRole: string): void {
  trackEvent({
    event: "action-menu-open",
    page,
    actorRole,
    outcome: "success",
  });
}

/**
 * Track when a user selects an action from a menu.
 */
export function trackActionSelect(
  page: string,
  actorRole: string,
  actionName: string,
  outcome: "success" | "error",
  errorMessage?: string
): void {
  trackEvent({
    event: outcome === "success" ? "action-select" : "action-error",
    page,
    actorRole,
    outcome,
    actionName,
    errorMessage,
  });
}

/**
 * Track when an action fails with an error.
 */
export function trackActionError(
  page: string,
  actorRole: string,
  actionName: string,
  errorMessage: string
): void {
  trackEvent({
    event: "action-error",
    page,
    actorRole,
    outcome: "error",
    actionName,
    errorMessage,
  });
}

// ============================================================================
// Filter Telemetry
// ============================================================================

export interface FilterTelemetryEvent {
  page: string;
  filterType: string;
  action: "apply" | "clear" | "change";
  latencyMs: number;
  outcome: "success" | "error";
  errorMessage?: string;
  resultCount?: number;
}

/**
 * Track filter apply action.
 */
export function trackFilterApply(
  page: string,
  filterType: string,
  latencyMs: number,
  resultCount?: number
): void {
  trackEvent({
    event: "filter-apply",
    page,
    actorRole: "",
    outcome: "success",
    actionName: `${filterType}:apply`,
  });
  
  // Also log to console for development tracking
  console.log(
    `[FilterTelemetry] apply | page=${page} | type=${filterType} | latency=${latencyMs}ms | results=${resultCount ?? "N/A"}`
  );
}

/**
 * Track filter clear action.
 */
export function trackFilterClear(
  page: string,
  latencyMs: number
): void {
  trackEvent({
    event: "filter-clear",
    page,
    actorRole: "",
    outcome: "success",
    actionName: "filters:clear",
  });
  
  console.log(
    `[FilterTelemetry] clear | page=${page} | latency=${latencyMs}ms`
  );
}

/**
 * Track filter change action.
 */
export function trackFilterChange(
  page: string,
  filterType: string,
  latencyMs: number
): void {
  console.log(
    `[FilterTelemetry] change | page=${page} | type=${filterType} | latency=${latencyMs}ms`
  );
}

/**
 * Track filter error.
 */
export function trackFilterError(
  page: string,
  filterType: string,
  errorMessage: string
): void {
  trackEvent({
    event: "filter-error",
    page,
    actorRole: "",
    outcome: "error",
    actionName: `${filterType}:error`,
    errorMessage,
  });
  
  console.error(
    `[FilterTelemetry] error | page=${page} | type=${filterType} | message=${errorMessage}`
  );
}

/**
 * Create a filter timing tracker.
 * Use in a filter operation to measure latency.
 * 
 * @example
 * ```tsx
 * const trackFilter = createFilterTracker("users-page", "search");
 * 
 * // Start tracking
 * trackFilter.start();
 * 
 * // ... perform filter operation ...
 * 
 * // End tracking with result count
 * trackFilter.end(resultCount);
 * ```
 */
export function createFilterTracker(
  page: string,
  filterType: string
): {
  start: () => void;
  end: (resultCount?: number) => void;
  error: (errorMessage: string) => void;
} {
  let startTime: number | null = null;
  
  return {
    start: () => {
      startTime = Date.now();
    },
    end: (resultCount?: number) => {
      if (startTime !== null) {
        const latencyMs = Date.now() - startTime;
        trackFilterApply(page, filterType, latencyMs, resultCount);
        startTime = null;
      }
    },
    error: (errorMessage: string) => {
      if (startTime !== null) {
        const latencyMs = Date.now() - startTime;
        console.log(
          `[FilterTelemetry] error-after-apply | page=${page} | type=${filterType} | latency=${latencyMs}ms | message=${errorMessage}`
        );
        startTime = null;
      }
    },
  };
}