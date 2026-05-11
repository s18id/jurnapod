/**
 * Customer not found error.
 */
export declare class CustomerNotFoundError extends Error {
    constructor(message?: string);
}
/**
 * Customer code conflict error - code already exists in company.
 */
export declare class CustomerCodeConflictError extends Error {
    constructor(message?: string);
}
/**
 * Customer validation error - invalid data for business rules.
 */
export declare class CustomerValidationError extends Error {
    constructor(message?: string);
}
//# sourceMappingURL=errors.d.ts.map