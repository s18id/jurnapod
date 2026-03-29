/**
 * Passwords submodule - hashing and policy validation
 */

export { PasswordHasher } from "./hash.js";
export type { PasswordPolicyOptions } from "./policy.js";
export {
  validatePasswordPolicy,
  isPasswordStrongEnough,
  DEFAULT_PASSWORD_POLICY
} from "./policy.js";
