// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { UserProfile, UserRow } from "../types/user.js";

/**
 * Input for creating a user.
 */
export interface CreateUserInput {
  companyId: number;
  email: string;
  passwordHash: string;
  name?: string | null;
  isActive?: boolean;
}

/**
 * Repository interface for user data access.
 * Implemented by the DB adapter layer.
 */
export interface UserRepository {
  /**
   * Find a user by ID within a company.
   */
  findById(companyId: number, userId: number): Promise<UserRow | null>;

  /**
   * Find a user by email within a company.
   */
  findByEmail(companyId: number, email: string): Promise<UserRow | null>;

  /**
   * Create a new user.
   * Returns the inserted user ID.
   */
  create(data: CreateUserInput): Promise<number>;

  /**
   * Update user email.
   */
  updateEmail(companyId: number, userId: number, email: string): Promise<void>;

  /**
   * Update user active state.
   */
  setActive(companyId: number, userId: number, isActive: boolean): Promise<void>;

  /**
   * Update user password hash.
   */
  setPasswordHash(companyId: number, userId: number, passwordHash: string): Promise<void>;

  /**
   * List users for a company with optional filters.
   */
  list(companyId: number, filters?: { isActive?: boolean; search?: string }): Promise<UserRow[]>;

  /**
   * Hydrate global roles for a list of user IDs.
   */
  hydrateGlobalRoles(userIds: number[]): Promise<Map<number, string[]>>;

  /**
   * Hydrate outlet role assignments for a list of user IDs.
   */
  hydrateOutletRoleAssignments(userIds: number[]): Promise<Map<number, UserProfile["outlet_role_assignments"]>>;
}