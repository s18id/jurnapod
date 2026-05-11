/**
 * Role definitions for the platform.
 * These define the available roles and their properties.
 */
export declare const ROLE_DEFINITIONS: readonly [{
    readonly code: "SUPER_ADMIN";
    readonly name: "Super Admin";
    readonly isGlobal: true;
    readonly roleLevel: 100;
}, {
    readonly code: "OWNER";
    readonly name: "Owner";
    readonly isGlobal: true;
    readonly roleLevel: 90;
}, {
    readonly code: "COMPANY_ADMIN";
    readonly name: "Company Admin";
    readonly isGlobal: true;
    readonly roleLevel: 80;
}, {
    readonly code: "ADMIN";
    readonly name: "Admin";
    readonly isGlobal: false;
    readonly roleLevel: 60;
}, {
    readonly code: "ACCOUNTANT";
    readonly name: "Accountant";
    readonly isGlobal: false;
    readonly roleLevel: 40;
}, {
    readonly code: "CASHIER";
    readonly name: "Cashier";
    readonly isGlobal: false;
    readonly roleLevel: 20;
}];
export type RoleCode = (typeof ROLE_DEFINITIONS)[number]["code"];
export declare function isValidRoleCode(code: string): code is RoleCode;
export declare function getRoleByCode(code: RoleCode): {
    readonly code: "SUPER_ADMIN";
    readonly name: "Super Admin";
    readonly isGlobal: true;
    readonly roleLevel: 100;
} | {
    readonly code: "OWNER";
    readonly name: "Owner";
    readonly isGlobal: true;
    readonly roleLevel: 90;
} | {
    readonly code: "COMPANY_ADMIN";
    readonly name: "Company Admin";
    readonly isGlobal: true;
    readonly roleLevel: 80;
} | {
    readonly code: "ADMIN";
    readonly name: "Admin";
    readonly isGlobal: false;
    readonly roleLevel: 60;
} | {
    readonly code: "ACCOUNTANT";
    readonly name: "Accountant";
    readonly isGlobal: false;
    readonly roleLevel: 40;
} | {
    readonly code: "CASHIER";
    readonly name: "Cashier";
    readonly isGlobal: false;
    readonly roleLevel: 20;
} | undefined;
//# sourceMappingURL=role-definitions.d.ts.map