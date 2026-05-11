// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
/**
 * Error thrown when setting validation fails (wrong type in DB).
 */
export class SettingValidationError extends Error {
    constructor(key, expectedType, actualType) {
        super(`Setting '${key}' has wrong type. Expected ${expectedType}, got ${actualType}`);
        this.name = "SettingValidationError";
    }
}
/**
 * Error thrown when companyId or outletId is invalid.
 */
export class InvalidSettingsContextError extends Error {
    constructor(message) {
        super(message);
        this.name = "InvalidSettingsContextError";
    }
}
//# sourceMappingURL=port.js.map