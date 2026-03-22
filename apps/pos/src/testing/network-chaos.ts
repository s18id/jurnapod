// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Network Chaos Tool for POS
 * 
 * Provides network failure simulation for testing POS resilience:
 * - Packet loss simulation
 * - Latency injection
 * - Connection drops
 * - DNS failures
 */

export interface NetworkChaosSettings {
  enabled: boolean;
  packetLossPercent: number;
  averageLatencyMs: number;
  latencyVarianceMs: number;
  connectionDropPercent: number;
  dnsFailurePercent: number;
  timeoutPercent: number;
  timeoutDurationMs: number;
}

export const DEFAULT_CHAOS_SETTINGS: NetworkChaosSettings = {
  enabled: false,
  packetLossPercent: 0,
  averageLatencyMs: 0,
  latencyVarianceMs: 0,
  connectionDropPercent: 0,
  dnsFailurePercent: 0,
  timeoutPercent: 0,
  timeoutDurationMs: 5000
};

export interface ChaosTestScenario {
  name: string;
  description: string;
  settings: Partial<NetworkChaosSettings>;
}

export const PREDEFINED_SCENARIOS: ChaosTestScenario[] = [
  {
    name: "mild_instability",
    description: "10% packet loss, 100ms latency with variance",
    settings: {
      packetLossPercent: 10,
      averageLatencyMs: 100,
      latencyVarianceMs: 50
    }
  },
  {
    name: "moderate_instability",
    description: "20% packet loss, 500ms latency with variance",
    settings: {
      packetLossPercent: 20,
      averageLatencyMs: 500,
      latencyVarianceMs: 200
    }
  },
  {
    name: "severe_instability",
    description: "30% packet loss, 1000ms latency, 5% connection drops",
    settings: {
      packetLossPercent: 30,
      averageLatencyMs: 1000,
      latencyVarianceMs: 500,
      connectionDropPercent: 5
    }
  },
  {
    name: "latency_only",
    description: "No packet loss but 500ms added latency",
    settings: {
      packetLossPercent: 0,
      averageLatencyMs: 500,
      latencyVarianceMs: 100
    }
  },
  {
    name: "timeout_prone",
    description: "10% requests will timeout after 3 seconds",
    settings: {
      timeoutPercent: 10,
      timeoutDurationMs: 3000
    }
  }
];

/**
 * Network Chaos Manager
 * 
 * Manages network chaos injection for testing
 */
export class NetworkChaosManager {
  private settings: NetworkChaosSettings;
  private originalFetch: typeof fetch | null = null;
  private originalXhr: typeof XMLHttpRequest | null = null;
  private listeners: Set<(settings: NetworkChaosSettings) => void> = new Set();

  constructor(settings: NetworkChaosSettings = DEFAULT_CHAOS_SETTINGS) {
    this.settings = { ...settings };
  }

  /**
   * Enable chaos mode
   */
  enable(): void {
    if (this.settings.enabled) return;

    this.settings.enabled = true;

    // Store original fetch
    this.originalFetch = window.fetch.bind(window);

    // Replace fetch with chaos-enabled version
    window.fetch = this.createChaosFetch.bind(this);

    this.notifyListeners();
  }

  /**
   * Disable chaos mode
   */
  disable(): void {
    if (!this.settings.enabled) return;

    this.settings.enabled = false;

    // Restore original fetch
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    this.notifyListeners();
  }

  /**
   * Update chaos settings
   */
  updateSettings(newSettings: Partial<NetworkChaosSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.notifyListeners();
  }

  /**
   * Get current settings
   */
  getSettings(): NetworkChaosSettings {
    return { ...this.settings };
  }

  /**
   * Apply a predefined scenario
   */
  applyScenario(scenario: ChaosTestScenario): void {
    this.updateSettings(scenario.settings);
  }

  /**
   * Reset to default settings
   */
  reset(): void {
    this.disable();
    this.settings = { ...DEFAULT_CHAOS_SETTINGS };
    this.notifyListeners();
  }

  /**
   * Add a listener for settings changes
   */
  addListener(listener: (settings: NetworkChaosSettings) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove a listener
   */
  removeListener(listener: (settings: NetworkChaosSettings) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of settings change
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.settings);
      } catch (e) {
        console.error("[NetworkChaos] Listener error:", e);
      }
    }
  }

  /**
   * Create chaos-enabled fetch function
   */
  private createChaosFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      // Check if chaos is disabled
      if (!this.settings.enabled) {
        this.originalFetch!(input, init).then(resolve).catch(reject);
        return;
      }

      // Simulate DNS failure
      if (
        this.settings.dnsFailurePercent > 0 &&
        Math.random() * 100 < this.settings.dnsFailurePercent
      ) {
        reject(new Error("NetworkError: DNS lookup failed"));
        return;
      }

      // Simulate packet loss
      if (Math.random() * 100 < this.settings.packetLossPercent) {
        // Simulate as if the request was sent but no response received
        const packetLossError = new Error("NetworkError: Request lost (packet loss)");
        reject(packetLossError);
        return;
      }

      // Calculate latency
      let latency = 0;
      if (this.settings.averageLatencyMs > 0) {
        const variance = this.settings.latencyVarianceMs;
        latency = this.settings.averageLatencyMs + (Math.random() - 0.5) * 2 * variance;
        latency = Math.max(0, latency);
      }

      // Simulate connection drop
      if (
        this.settings.connectionDropPercent > 0 &&
        Math.random() * 100 < this.settings.connectionDropPercent
      ) {
        setTimeout(() => {
          reject(new Error("NetworkError: Connection reset by peer"));
        }, latency);
        return;
      }

      // Simulate timeout
      if (
        this.settings.timeoutPercent > 0 &&
        Math.random() * 100 < this.settings.timeoutPercent
      ) {
        setTimeout(() => {
          reject(new Error(`NetworkError: Request timeout after ${this.settings.timeoutDurationMs}ms`));
        }, this.settings.timeoutDurationMs);
        return;
      }

      // Apply latency and forward to original fetch
      setTimeout(() => {
        if (!this.originalFetch) {
          reject(new Error("NetworkError: Fetch not available"));
          return;
        }

        this.originalFetch(input, init)
          .then(response => {
            // Occasionally simulate server-side delay
            if (this.settings.averageLatencyMs > 0 && Math.random() < 0.1) {
              // 10% chance of additional server-side delay
              setTimeout(() => resolve(response), this.settings.averageLatencyMs / 2);
            } else {
              resolve(response);
            }
          })
          .catch(error => {
            // Don't wrap already chaotic errors
            if (error.message.includes("NetworkError")) {
              reject(error);
            } else {
              // Occasionally inject chaos into errors too
              if (Math.random() * 100 < this.settings.packetLossPercent) {
                reject(new Error("NetworkError: Connection reset during error handling"));
              } else {
                reject(error);
              }
            }
          });
      }, latency);
    });
  }

  /**
   * Get chaos statistics (for reporting)
   */
  getStats(): {
    enabled: boolean;
    scenarios: string[];
    activeScenario: string | null;
  } {
    return {
      enabled: this.settings.enabled,
      scenarios: PREDEFINED_SCENARIOS.map(s => s.name),
      activeScenario: this.findActiveScenario()?.name ?? null
    };
  }

  /**
   * Find which predefined scenario matches current settings
   */
  private findActiveScenario(): ChaosTestScenario | null {
    for (const scenario of PREDEFINED_SCENARIOS) {
      const matches = Object.entries(scenario.settings).every(
        ([key, value]) => this.settings[key as keyof NetworkChaosSettings] === value
      );
      if (matches) return scenario;
    }
    return null;
  }
}

// Singleton for global network chaos management
let globalNetworkChaosManager: NetworkChaosManager | null = null;

export function getNetworkChaosManager(): NetworkChaosManager {
  if (!globalNetworkChaosManager) {
    globalNetworkChaosManager = new NetworkChaosManager();
  }
  return globalNetworkChaosManager;
}

/**
 * Helper to run a chaos test with automatic cleanup
 */
export async function withNetworkChaos<T>(
  scenario: ChaosTestScenario,
  operation: () => Promise<T>
): Promise<T> {
  const chaos = getNetworkChaosManager();
  chaos.applyScenario(scenario);
  chaos.enable();

  try {
    return await operation();
  } finally {
    chaos.disable();
  }
}
