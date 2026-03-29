// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { 
  SyncModule, 
  SyncEndpoint, 
  SyncModuleInitContext,
  SyncModuleFactory
} from "../types/module.js";
import type { SyncClientType } from "../types/index.js";

export class SyncModuleRegistry {
  private modules = new Map<string, SyncModule>();
  private factories = new Map<string, SyncModuleFactory>();
  private initContext?: SyncModuleInitContext;

  /**
   * Register a module factory
   */
  registerFactory(moduleId: string, factory: SyncModuleFactory): void {
    if (this.factories.has(moduleId)) {
      throw new Error(`Module factory '${moduleId}' is already registered`);
    }
    this.factories.set(moduleId, factory);
  }

  /**
   * Register a module instance directly
   */
  register(module: SyncModule): void {
    if (this.modules.has(module.moduleId)) {
      throw new Error(`Module '${module.moduleId}' is already registered`);
    }
    this.modules.set(module.moduleId, module);
  }

  /**
   * Initialize the registry with context
   */
  async initialize(context: SyncModuleInitContext): Promise<void> {
    this.initContext = context;
    
    // Initialize all registered modules
    for (const module of this.modules.values()) {
      await module.initialize(context);
    }
  }

  /**
   * Create and register module from factory
   */
  async createModule(moduleId: string, config: any): Promise<SyncModule> {
    const factory = this.factories.get(moduleId);
    if (!factory) {
      throw new Error(`Module factory '${moduleId}' not found`);
    }

    const module = factory(config);
    this.register(module);

    if (this.initContext) {
      await module.initialize(this.initContext);
    }

    return module;
  }

  /**
   * Get module by ID
   */
  getModule(moduleId: string): SyncModule | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Get modules by client type
   */
  getModulesByClientType(clientType: SyncClientType): SyncModule[] {
    return Array.from(this.modules.values()).filter(
      module => module.clientType === clientType
    );
  }

  /**
   * Get all endpoints from all modules
   */
  getAllEndpoints(): SyncEndpoint[] {
    const endpoints: SyncEndpoint[] = [];
    for (const module of this.modules.values()) {
      endpoints.push(...module.endpoints);
    }
    return endpoints;
  }

  /**
   * Get endpoints for a specific module
   */
  getModuleEndpoints(moduleId: string): SyncEndpoint[] {
    const module = this.modules.get(moduleId);
    return module ? [...module.endpoints] : [];
  }

  /**
   * List all registered module IDs
   */
  listModuleIds(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Health check all modules
   */
  async healthCheck(): Promise<{ [moduleId: string]: { healthy: boolean; message?: string } }> {
    const results: { [moduleId: string]: { healthy: boolean; message?: string } } = {};
    
    for (const [moduleId, module] of this.modules.entries()) {
      try {
        results[moduleId] = await module.healthCheck();
      } catch (error) {
        results[moduleId] = {
          healthy: false,
          message: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
    
    return results;
  }

  /**
   * Cleanup all modules
   */
  async cleanup(): Promise<void> {
    for (const module of this.modules.values()) {
      try {
        await module.cleanup();
      } catch (error) {
        console.error(`Error cleaning up module ${module.moduleId}:`, error);
      }
    }
    this.modules.clear();
  }
}

// Singleton instance
export const syncModuleRegistry = new SyncModuleRegistry();