/**
 * Password policy validation
 */

export interface PasswordPolicyOptions {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSpecial: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicyOptions = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true
};

/**
 * Validates a password against policy requirements
 */
export function validatePasswordPolicy(
  password: string,
  policy: PasswordPolicyOptions = DEFAULT_PASSWORD_POLICY
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters long`);
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (policy.requireDigit && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one digit");
  }

  if (policy.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if a password meets minimum strength requirements
 * (Simplified version that only checks length)
 */
export function isPasswordStrongEnough(
  password: string,
  minLength: number = 8
): boolean {
  return password.length >= minLength;
}
