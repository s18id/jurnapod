// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reservations Module - Audit Port Interface
 *
 * Optional audit port for reservation group mutations.
 * Package emits audit events through this interface without direct dependency on @jurnapod/modules-platform.
 */

export interface ReservationAuditPort {
  log(input: {
    action:
      | 'reservation_group.create'
      | 'reservation_group.update'
      | 'reservation_group.delete'
      | 'reservation_group.tables_changed';
    companyId: number;
    outletId: number;
    actorUserId: number;
    entityId: number;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * No-op audit port implementation.
 * Used when no audit adapter is provided - ensures no failure due to missing platform module.
 */
export const NOOP_AUDIT_PORT: ReservationAuditPort = {
  async log() {
    // No-op - do nothing
  },
};
