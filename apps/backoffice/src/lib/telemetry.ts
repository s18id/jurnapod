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