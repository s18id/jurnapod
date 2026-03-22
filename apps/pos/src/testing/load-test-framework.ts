// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Load Testing Framework
 * 
 * Provides load testing capabilities for POS checkout flow:
 * - Configurable concurrency (10-50 concurrent checkouts)
 * - Performance instrumentation
 * - Network chaos simulation
 * - SLO validation
 */

export interface LoadTestConfig {
  concurrency: number;
  durationSeconds: number;
  rampUpSeconds?: number;
  thinkTimeMs?: number;
  companyId: number;
  outletId: number;
}

export interface LoadTestResult {
  success: boolean;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  durationMs: number;
  latencyPercentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: number; // requests per second
  errors: LoadTestError[];
  sloCompliance: SLOComplianceResult;
}

export interface LoadTestError {
  type: string;
  count: number;
  sampleError?: string;
}

export interface SLOComplianceResult {
  paymentCaptureP95Compliant: boolean;
  paymentCaptureP99Compliant: boolean;
  successRateCompliant: boolean;
  overallCompliant: boolean;
  details: string[];
}

export interface NetworkChaosConfig {
  packetLossPercent: number;
  latencyMs: number;
  latencyVarianceMs?: number;
  connectionDropPercent?: number;
}

export interface CheckoutLoadMetrics {
  paymentCaptureLatencies: number[];
  offlineCommitLatencies: number[];
  syncLatencies: number[];
  successCount: number;
  failureCount: number;
  errorsByType: Map<string, number>;
}

/**
 * POS Load Test Runner
 */
export class POSLoadTestRunner {
  private config: LoadTestConfig;
  private metrics: CheckoutLoadMetrics;
  private abortController: AbortController | null = null;
  private isRunning = false;

  constructor(config: LoadTestConfig) {
    this.config = config;
    this.metrics = this.initMetrics();
  }

  private initMetrics(): CheckoutLoadMetrics {
    return {
      paymentCaptureLatencies: [],
      offlineCommitLatencies: [],
      syncLatencies: [],
      successCount: 0,
      failureCount: 0,
      errorsByType: new Map()
    };
  }

  /**
   * Run the load test
   */
  async run(
    checkoutOperation: (context: LoadTestContext) => Promise<LoadTestOperationResult>
  ): Promise<LoadTestResult> {
    if (this.isRunning) {
      throw new Error("Load test is already running");
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.metrics = this.initMetrics();

    const startTime = performance.now();
    let currentConcurrency = 0;
    const rampUpIncrement = this.config.rampUpSeconds
      ? this.config.concurrency / (this.config.rampUpSeconds * 10)
      : this.config.concurrency;

    try {
      // Ramp up phase
      while (currentConcurrency < this.config.concurrency && !this.abortController!.signal.aborted) {
        currentConcurrency = Math.min(currentConcurrency + rampUpIncrement, this.config.concurrency);
        const activeWorkers = Math.floor(currentConcurrency);

        await this.runBurst(activeWorkers, checkoutOperation);

        if (currentConcurrency < this.config.concurrency) {
          await this.sleep(100); // Small delay between ramp-up increments
        }
      }

      // Steady state phase
      const steadyStateDuration = this.config.durationSeconds * 1000 - (performance.now() - startTime);
      if (steadyStateDuration > 0 && !this.abortController.signal.aborted) {
        await this.runSteadyState(this.config.concurrency, steadyStateDuration, checkoutOperation);
      }
    } finally {
      this.isRunning = false;
    }

    const endTime = performance.now();
    return this.aggregateResults(endTime - startTime);
  }

  /**
   * Run a burst of concurrent operations
   */
  private async runBurst(
    concurrency: number,
    operation: (context: LoadTestContext) => Promise<LoadTestOperationResult>
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      const context = this.createContext(i);
      promises.push(this.executeOperation(context, operation));
    }
    await Promise.all(promises);
  }

  /**
   * Run steady state load
   */
  private async runSteadyState(
    concurrency: number,
    durationMs: number,
    operation: (context: LoadTestContext) => Promise<LoadTestOperationResult>
  ): Promise<void> {
    const workers: Promise<void>[] = [];
    const endTime = Date.now() + durationMs;

    for (let i = 0; i < concurrency; i++) {
      const worker = this.runWorker(i, endTime, operation);
      workers.push(worker);
    }

    await Promise.all(workers);
  }

  /**
   * Run a single worker that executes operations until endTime
   */
  private async runWorker(
    workerId: number,
    endTime: number,
    operation: (context: LoadTestContext) => Promise<LoadTestOperationResult>
  ): Promise<void> {
    let iteration = 0;
    while (Date.now() < endTime && !this.abortController!.signal.aborted) {
      const context = this.createContext(workerId * 1000 + iteration);
      await this.executeOperation(context, operation);

      // Apply think time if configured
      if (this.config.thinkTimeMs && this.config.thinkTimeMs > 0) {
        await this.sleep(this.config.thinkTimeMs);
      }
      iteration++;
    }
  }

  /**
   * Execute a single checkout operation with telemetry
   */
  private async executeOperation(
    context: LoadTestContext,
    operation: (context: LoadTestContext) => Promise<LoadTestOperationResult>
  ): Promise<void> {
    try {
      const result = await operation(context);

      if (result.success) {
        this.metrics.successCount++;
        if (result.paymentCaptureLatencyMs !== undefined) {
          this.metrics.paymentCaptureLatencies.push(result.paymentCaptureLatencyMs);
        }
        if (result.offlineCommitLatencyMs !== undefined) {
          this.metrics.offlineCommitLatencies.push(result.offlineCommitLatencyMs);
        }
        if (result.syncLatencyMs !== undefined) {
          this.metrics.syncLatencies.push(result.syncLatencyMs);
        }
      } else {
        this.metrics.failureCount++;
        const errorType = result.errorType ?? "UnknownError";
        this.metrics.errorsByType.set(
          errorType,
          (this.metrics.errorsByType.get(errorType) ?? 0) + 1
        );
      }
    } catch (error) {
      this.metrics.failureCount++;
      const errorType = error instanceof Error ? error.name : "UnknownError";
      this.metrics.errorsByType.set(
        errorType,
        (this.metrics.errorsByType.get(errorType) ?? 0) + 1
      );
    }

    // Trim metrics to prevent memory issues
    this.trimMetrics();
  }

  /**
   * Create a load test context
   */
  private createContext(id: number): LoadTestContext {
    return {
      requestId: `load-test-${id}-${Date.now()}`,
      companyId: this.config.companyId,
      outletId: this.config.outletId,
      timestamp: Date.now()
    };
  }

  /**
   * Aggregate results into final report
   */
  private aggregateResults(durationMs: number): LoadTestResult {
    const totalRequests = this.metrics.successCount + this.metrics.failureCount;
    const sortedLatencies = [...this.metrics.paymentCaptureLatencies].sort((a, b) => a - b);

    const errors: LoadTestError[] = [];
    for (const [type, count] of this.metrics.errorsByType.entries()) {
      errors.push({ type, count });
    }

    const latencyPercentiles = this.calculatePercentiles(sortedLatencies);
    const throughput = (totalRequests / durationMs) * 1000;

    const sloCompliance = this.validateSLOCompliance(latencyPercentiles, totalRequests);

    return {
      success: this.metrics.failureCount === 0,
      totalRequests,
      successfulRequests: this.metrics.successCount,
      failedRequests: this.metrics.failureCount,
      durationMs,
      latencyPercentiles,
      throughput,
      errors,
      sloCompliance
    };
  }

  /**
   * Calculate latency percentiles
   */
  private calculatePercentiles(sortedLatencies: number[]): { p50: number; p95: number; p99: number } {
    if (sortedLatencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const percentile = (p: number): number => {
      const index = Math.ceil((p / 100) * sortedLatencies.length) - 1;
      return sortedLatencies[Math.max(0, index)];
    };

    return {
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99)
    };
  }

  /**
   * Validate SLO compliance
   */
  private validateSLOCompliance(
    percentiles: { p50: number; p95: number; p99: number },
    totalRequests: number
  ): SLOComplianceResult {
    const details: string[] = [];

    const paymentCaptureP95Compliant = percentiles.p95 <= 1000; // 1 second target
    if (!paymentCaptureP95Compliant) {
      details.push(`payment_capture p95 (${percentiles.p95}ms) exceeds 1000ms target`);
    }

    const paymentCaptureP99Compliant = percentiles.p99 <= 2000; // 2 second target
    if (!paymentCaptureP99Compliant) {
      details.push(`payment_capture p99 (${percentiles.p99}ms) exceeds 2000ms target`);
    }

    const successRate = totalRequests > 0 ? (this.metrics.successCount / totalRequests) * 100 : 100;
    const successRateCompliant = successRate >= 99;
    if (!successRateCompliant) {
      details.push(`success rate (${successRate.toFixed(2)}%) below 99% target`);
    }

    return {
      paymentCaptureP95Compliant,
      paymentCaptureP99Compliant,
      successRateCompliant,
      overallCompliant: paymentCaptureP95Compliant && paymentCaptureP99Compliant && successRateCompliant,
      details
    };
  }

  /**
   * Trim metrics to prevent memory issues
   */
  private trimMetrics(): void {
    const maxSamples = 10000;
    if (this.metrics.paymentCaptureLatencies.length > maxSamples) {
      this.metrics.paymentCaptureLatencies = this.metrics.paymentCaptureLatencies.slice(-maxSamples);
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Abort the running load test
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if test is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}

export interface LoadTestContext {
  requestId: string;
  companyId: number;
  outletId: number;
  timestamp: number;
}

export interface LoadTestOperationResult {
  success: boolean;
  paymentCaptureLatencyMs?: number;
  offlineCommitLatencyMs?: number;
  syncLatencyMs?: number;
  errorType?: string;
  errorMessage?: string;
}

/**
 * Network Chaos Controller
 * 
 * Simulates network issues for testing resilience
 */
export class NetworkChaosController {
  private config: NetworkChaosConfig;
  private originalFetch: typeof fetch | null = null;
  private isActive = false;

  constructor(config: NetworkChaosConfig) {
    this.config = config;
  }

  /**
   * Activate network chaos
   */
  activate(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.originalFetch = window.fetch.bind(window);
    window.fetch = this.chaosFetch.bind(this);
  }

  /**
   * Deactivate network chaos and restore original fetch
   */
  deactivate(): void {
    if (!this.isActive || !this.originalFetch) return;
    window.fetch = this.originalFetch;
    this.originalFetch = null;
    this.isActive = false;
  }

  /**
   * Chaos-enabled fetch
   */
  private async chaosFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // Simulate packet loss
    if (Math.random() * 100 < this.config.packetLossPercent) {
      throw new Error("NetworkError: simulated packet loss");
    }

    // Simulate latency
    const baseLatency = this.config.latencyMs;
    const variance = this.config.latencyVarianceMs ?? 0;
    const additionalLatency = (Math.random() - 0.5) * 2 * variance;
    const totalLatency = Math.max(0, baseLatency + additionalLatency);

    await new Promise(resolve => setTimeout(resolve, totalLatency));

    // Simulate connection drops
    if (
      this.config.connectionDropPercent &&
      Math.random() * 100 < this.config.connectionDropPercent
    ) {
      throw new Error("NetworkError: connection reset");
    }

    // Fall through to original fetch
    return this.originalFetch!(input, init);
  }

  /**
   * Update chaos configuration
   */
  updateConfig(config: Partial<NetworkChaosConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if chaos is active
   */
  getIsActive(): boolean {
    return this.isActive;
  }
}

/**
 * Create a default load test configuration
 */
export function createLoadTestConfig(
  overrides: Partial<LoadTestConfig> = {}
): LoadTestConfig {
  return {
    concurrency: 10,
    durationSeconds: 60,
    rampUpSeconds: 5,
    thinkTimeMs: 1000,
    companyId: 1,
    outletId: 1,
    ...overrides
  };
}
