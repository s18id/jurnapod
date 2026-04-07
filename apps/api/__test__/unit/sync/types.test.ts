// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for sync types - error type guards and helpers
 * 
 * Pure function tests - no database required.
 */

import { describe, it, expect } from 'vitest';
import {
  isMysqlError,
  isRetryableMysqlError,
  isClientTxIdDuplicateError,
  readDuplicateKeyName,
  toRetryableDbErrorMessage,
  toErrorResult,
  MYSQL_DUPLICATE_ERROR_CODE,
  MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE,
  MYSQL_DEADLOCK_ERROR_CODE,
  POS_TRANSACTIONS_CLIENT_TX_UNIQUE_KEY,
} from '../../../src/lib/sync/push/types';

describe('sync.types', () => {
  describe('isMysqlError', () => {
    it('returns true for object with errno', () => {
      const error = { errno: 1062, message: 'Duplicate entry' };
      expect(isMysqlError(error)).toBe(true);
    });

    it('returns true for error with errno and code', () => {
      const error = { errno: 1062, code: 'ER_DUP_ENTRY', message: 'Duplicate' };
      expect(isMysqlError(error)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isMysqlError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isMysqlError(undefined)).toBe(false);
    });

    it('returns false for plain object without errno', () => {
      expect(isMysqlError({ message: 'error' })).toBe(false);
    });

    it('returns false for string', () => {
      expect(isMysqlError('error message')).toBe(false);
    });
  });

  describe('isRetryableMysqlError', () => {
    it('returns true for lock wait timeout', () => {
      const error = { errno: MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE };
      expect(isRetryableMysqlError(error)).toBe(true);
    });

    it('returns true for deadlock', () => {
      const error = { errno: MYSQL_DEADLOCK_ERROR_CODE };
      expect(isRetryableMysqlError(error)).toBe(true);
    });

    it('returns false for duplicate entry', () => {
      const error = { errno: MYSQL_DUPLICATE_ERROR_CODE };
      expect(isRetryableMysqlError(error)).toBe(false);
    });

    it('returns false for error without errno', () => {
      expect(isRetryableMysqlError({ message: 'error' })).toBe(false);
    });
  });

  describe('readDuplicateKeyName', () => {
    it('extracts key name from sqlMessage', () => {
      const error = {
        sqlMessage: "Duplicate entry 'test' for key 'uq_users_email'"
      };
      expect(readDuplicateKeyName(error)).toBe('uq_users_email');
    });

    it('handles backtick key names', () => {
      const error = {
        sqlMessage: "Duplicate entry 'test' for key `uq_users_email`"
      };
      expect(readDuplicateKeyName(error)).toBe('uq_users_email');
    });

    it('extracts just the key name without table prefix', () => {
      const error = {
        sqlMessage: "Duplicate entry 'test' for key 'users.uq_users_email'"
      };
      expect(readDuplicateKeyName(error)).toBe('uq_users_email');
    });

    it('returns null when no key pattern found', () => {
      const error = { sqlMessage: 'Some other error message' };
      expect(readDuplicateKeyName(error)).toBeNull();
    });

    it('prefers sqlMessage over message', () => {
      const error = {
        sqlMessage: "Duplicate entry 'test' for key 'test_key'",
        message: "Different error for key 'other_key'"
      };
      expect(readDuplicateKeyName(error)).toBe('test_key');
    });

    it('falls back to message when no sqlMessage', () => {
      const error = {
        message: "Error for key 'fallback_key'"
      };
      expect(readDuplicateKeyName(error)).toBe('fallback_key');
    });

    it('returns null for empty message', () => {
      expect(readDuplicateKeyName({})).toBeNull();
    });
  });

  describe('isClientTxIdDuplicateError', () => {
    it('returns true for duplicate on pos_transactions client_tx key', () => {
      const error = {
        errno: MYSQL_DUPLICATE_ERROR_CODE,
        sqlMessage: "Duplicate entry 'tx_123' for key 'uq_pos_transactions_outlet_client_tx'"
      };
      expect(isClientTxIdDuplicateError(error)).toBe(true);
    });

    it('returns false for duplicate on different key', () => {
      const error = {
        errno: MYSQL_DUPLICATE_ERROR_CODE,
        sqlMessage: "Duplicate entry 'test' for key 'uq_users_email'"
      };
      expect(isClientTxIdDuplicateError(error)).toBe(false);
    });

    it('returns false for non-duplicate error', () => {
      const error = {
        errno: MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE,
        message: 'Lock wait timeout'
      };
      expect(isClientTxIdDuplicateError(error)).toBe(false);
    });

    it('returns false when key is not found', () => {
      const error = {
        errno: MYSQL_DUPLICATE_ERROR_CODE,
        message: 'Duplicate entry'
      };
      expect(isClientTxIdDuplicateError(error)).toBe(false);
    });
  });

  describe('toRetryableDbErrorMessage', () => {
    it('returns LOCK_TIMEOUT message for lock wait error', () => {
      const error = { errno: MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE };
      expect(toRetryableDbErrorMessage(error)).toBe('RETRYABLE_DB_LOCK_TIMEOUT');
    });

    it('returns DEADLOCK message for deadlock error', () => {
      const error = { errno: MYSQL_DEADLOCK_ERROR_CODE };
      expect(toRetryableDbErrorMessage(error)).toBe('RETRYABLE_DB_DEADLOCK');
    });
  });

  describe('toErrorResult', () => {
    it('creates error result object', () => {
      const result = toErrorResult('tx_123', 'Something went wrong');
      
      expect(result.client_tx_id).toBe('tx_123');
      expect(result.result).toBe('ERROR');
      expect(result.message).toBe('Something went wrong');
    });
  });

  describe('constants', () => {
    it('has correct duplicate error code', () => {
      expect(MYSQL_DUPLICATE_ERROR_CODE).toBe(1062);
    });

    it('has correct lock wait timeout code', () => {
      expect(MYSQL_LOCK_WAIT_TIMEOUT_ERROR_CODE).toBe(1205);
    });

    it('has correct deadlock code', () => {
      expect(MYSQL_DEADLOCK_ERROR_CODE).toBe(1213);
    });

    it('has correct POS transactions unique key name', () => {
      expect(POS_TRANSACTIONS_CLIENT_TX_UNIQUE_KEY).toBe('uq_pos_transactions_outlet_client_tx');
    });
  });
});
