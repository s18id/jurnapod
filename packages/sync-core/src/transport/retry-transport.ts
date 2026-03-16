// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  retryableErrorCodes?: string[];
  retryableHttpCodes?: number[];
}

export interface TransportRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface TransportResponse<T = any> {
  success: boolean;
  status: number;
  data?: T;
  error?: string;
  headers?: Record<string, string>;
  retryAttempts?: number;
}

export class RetryTransport {
  private defaultConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffFactor: 2,
    retryableHttpCodes: [408, 429, 500, 502, 503, 504],
    retryableErrorCodes: ['TIMEOUT', 'NETWORK_ERROR', 'CONNECTION_RESET']
  };

  constructor(private config: Partial<RetryConfig> = {}) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Execute request with retry logic
   */
  async execute<T>(request: TransportRequest, retryConfig?: Partial<RetryConfig>): Promise<TransportResponse<T>> {
    const finalConfig: RetryConfig = { ...this.defaultConfig, ...this.config, ...retryConfig };
    let lastError: Error | null = null;
    let retryAttempts = 0;

    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest<T>(request);
        
        // Success case
        if (response.success || !this.shouldRetry(response, finalConfig)) {
          response.retryAttempts = retryAttempts;
          return response;
        }

        // Failed but retryable
        lastError = new Error(response.error || 'Request failed');
        retryAttempts++;

        // Don't delay on the last attempt
        if (attempt < finalConfig.maxRetries) {
          await this.delay(this.calculateDelay(attempt, finalConfig));
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        retryAttempts++;

        // Check if error is retryable
        if (!this.isRetryableError(lastError, finalConfig) || attempt >= finalConfig.maxRetries) {
          break;
        }

        // Don't delay on the last attempt
        if (attempt < finalConfig.maxRetries) {
          await this.delay(this.calculateDelay(attempt, finalConfig));
        }
      }
    }

    // All retries failed
    return {
      success: false,
      status: 0,
      error: lastError?.message || 'Request failed after retries',
      retryAttempts
    };
  }

  /**
   * Make the actual HTTP request
   * TODO: Implement actual HTTP client (fetch, axios, etc.)
   */
  private async makeRequest<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    try {
      // TODO: Replace with actual HTTP implementation
      // This is a placeholder that would use fetch() or axios
      
      const controller = new AbortController();
      const timeoutId = request.timeout ? setTimeout(() => controller.abort(), request.timeout) : null;

      const response = await fetch(request.url, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          ...request.headers
        },
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const data = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text();

      return {
        success: response.ok,
        status: response.status,
        data: data as T,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
        headers: Object.fromEntries(response.headers.entries())
      };

    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('TIMEOUT');
        }
        throw error;
      }
      throw new Error('Unknown network error');
    }
  }

  /**
   * Check if response should trigger a retry
   */
  private shouldRetry(response: TransportResponse, config: RetryConfig): boolean {
    return config.retryableHttpCodes?.includes(response.status) || false;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error, config: RetryConfig): boolean {
    const errorCode = this.extractErrorCode(error);
    return config.retryableErrorCodes?.includes(errorCode) || false;
  }

  /**
   * Extract error code from error message
   */
  private extractErrorCode(error: Error): string {
    if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
      return 'TIMEOUT';
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }
    if (error.message.includes('ECONNRESET') || error.message.includes('connection reset')) {
      return 'CONNECTION_RESET';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Calculate delay for next retry attempt
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelayMs * Math.pow(config.backoffFactor, attempt);
    return Math.min(delay, config.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const defaultRetryTransport = new RetryTransport();