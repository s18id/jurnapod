// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Unit tests for auth.parseLoginRequest
 * 
 * Pure function tests - no database required.
 * Tests Zod schema validation and transformation.
 */

import { describe, it, expect } from 'vitest';
import { parseLoginRequest } from '../../../src/lib/auth';

describe('auth.parseLogin', () => {
  describe('valid payloads', () => {
    it('parses valid payload with companyCode', () => {
      const result = parseLoginRequest({
        companyCode: 'JP',
        email: 'test@example.com',
        password: 'password123'
      });
      
      expect(result.companyCode).toBe('JP');
      expect(result.email).toBe('test@example.com');
      expect(result.password).toBe('password123');
    });

    it('parses valid payload with company_code (underscore)', () => {
      const result = parseLoginRequest({
        company_code: 'ACME',
        email: 'user@test.com',
        password: 'secret'
      });
      
      expect(result.companyCode).toBe('ACME');
      expect(result.email).toBe('user@test.com');
    });

    it('normalizes email to lowercase', () => {
      const result = parseLoginRequest({
        companyCode: 'JP',
        email: 'TEST@EXAMPLE.COM',
        password: 'password'
      });
      
      expect(result.email).toBe('test@example.com');
    });

    it('prefers companyCode over company_code', () => {
      const result = parseLoginRequest({
        companyCode: 'PRIMARY',
        company_code: 'SECONDARY',
        email: 'test@test.com',
        password: 'password'
      });
      
      expect(result.companyCode).toBe('PRIMARY');
    });

    it('handles trimmed whitespace in companyCode', () => {
      const result = parseLoginRequest({
        companyCode: '  JP  ',
        email: 'test@test.com',
        password: 'password'
      });
      
      expect(result.companyCode).toBe('JP');
    });
  });

  describe('invalid payloads', () => {
    it('throws for missing companyCode and company_code', () => {
      expect(() => parseLoginRequest({
        email: 'test@test.com',
        password: 'password'
      })).toThrow();
    });

    it('throws for empty companyCode', () => {
      expect(() => parseLoginRequest({
        companyCode: '',
        email: 'test@test.com',
        password: 'password'
      })).toThrow();
    });

    it('throws for missing email', () => {
      expect(() => parseLoginRequest({
        companyCode: 'JP',
        password: 'password'
      })).toThrow();
    });

    it('throws for invalid email format', () => {
      expect(() => parseLoginRequest({
        companyCode: 'JP',
        email: 'not-an-email',
        password: 'password'
      })).toThrow();
    });

    it('throws for missing password', () => {
      expect(() => parseLoginRequest({
        companyCode: 'JP',
        email: 'test@test.com'
      })).toThrow();
    });

    it('throws for empty password', () => {
      expect(() => parseLoginRequest({
        companyCode: 'JP',
        email: 'test@test.com',
        password: ''
      })).toThrow();
    });

    it('allows whitespace-only password (Zod min(1) only checks length)', () => {
      // Zod's min(1) only checks string length, not content
      // Whitespace strings pass because they have length > 0
      const result = parseLoginRequest({
        companyCode: 'JP',
        email: 'test@test.com',
        password: '   '
      });
      expect(result.password).toBe('   ');
    });
  });

  describe('edge cases', () => {
    it('handles companyCode at max length (32)', () => {
      const longCode = 'A'.repeat(32);
      const result = parseLoginRequest({
        companyCode: longCode,
        email: 'test@test.com',
        password: 'password'
      });
      
      expect(result.companyCode).toBe(longCode);
    });

    it('throws for companyCode over max length', () => {
      const longCode = 'A'.repeat(33);
      expect(() => parseLoginRequest({
        companyCode: longCode,
        email: 'test@test.com',
        password: 'password'
      })).toThrow();
    });

    it('handles email with plus addressing', () => {
      const result = parseLoginRequest({
        companyCode: 'JP',
        email: 'test+tag@example.com',
        password: 'password'
      });
      
      expect(result.email).toBe('test+tag@example.com');
    });

    it('handles password at max length (255)', () => {
      const longPassword = 'a'.repeat(255);
      const result = parseLoginRequest({
        companyCode: 'JP',
        email: 'test@test.com',
        password: longPassword
      });
      
      expect(result.password).toBe(longPassword);
    });
  });
});
