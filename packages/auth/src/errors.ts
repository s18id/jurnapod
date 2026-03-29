/**
 * Error classes for @jurnapod/auth
 */

// ---------------------------------------------------------------------------
// Base Error
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// ---------------------------------------------------------------------------
// Authentication Errors
// ---------------------------------------------------------------------------

export class InvalidCredentialsError extends AuthError {}
export class UserInactiveError extends AuthError {}

// ---------------------------------------------------------------------------
// Token Errors
// ---------------------------------------------------------------------------

export class TokenExpiredError extends AuthError {}
export class TokenInvalidError extends AuthError {}
export class TokenRevokedError extends AuthError {}

// ---------------------------------------------------------------------------
// Throttle Error
// ---------------------------------------------------------------------------

export class ThrottledError extends AuthError {
  constructor(message: string, public readonly delayMs: number) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Email Token Errors
// ---------------------------------------------------------------------------

export class EmailTokenNotFoundError extends AuthError {}
export class EmailTokenExpiredError extends AuthError {}
export class EmailTokenUsedError extends AuthError {}
export class EmailTokenInvalidError extends AuthError {}

// ---------------------------------------------------------------------------
// OAuth Errors
// ---------------------------------------------------------------------------

export class OAuthConfigError extends AuthError {}
export class OAuthExchangeError extends AuthError {}
export class OAuthVerificationError extends AuthError {}
export class OAuthAccountLinkedError extends AuthError {}
