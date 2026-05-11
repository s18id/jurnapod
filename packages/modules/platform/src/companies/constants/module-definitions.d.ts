/**
 * Module definitions for the platform.
 * These are foundational constants that define available modules.
 */
export declare const MODULE_DEFINITIONS: readonly [{
    readonly code: "platform";
    readonly name: "Platform";
    readonly description: "Core platform services";
}, {
    readonly code: "pos";
    readonly name: "POS";
    readonly description: "Point of sale";
}, {
    readonly code: "sales";
    readonly name: "Sales";
    readonly description: "Sales invoices";
}, {
    readonly code: "payments";
    readonly name: "Payments";
    readonly description: "Payment processing and management";
}, {
    readonly code: "inventory";
    readonly name: "Inventory";
    readonly description: "Stock movements and recipes";
}, {
    readonly code: "purchasing";
    readonly name: "Purchasing";
    readonly description: "Purchasing and payables";
}, {
    readonly code: "treasury";
    readonly name: "Treasury";
    readonly description: "Cash and bank transaction management";
}, {
    readonly code: "accounting";
    readonly name: "Accounting";
    readonly description: "General ledger, journals, accounts, fiscal years";
}, {
    readonly code: "reservations";
    readonly name: "Reservations";
    readonly description: "Bookings and table management";
}, {
    readonly code: "reports";
    readonly name: "Reports";
    readonly description: "Reporting and analytics";
}, {
    readonly code: "settings";
    readonly name: "Settings";
    readonly description: "Settings and configuration";
}, {
    readonly code: "accounts";
    readonly name: "Accounts";
    readonly description: "Chart of accounts";
}, {
    readonly code: "journals";
    readonly name: "Journals";
    readonly description: "Journal entries and posting";
}];
export type ModuleCode = (typeof MODULE_DEFINITIONS)[number]["code"];
/**
 * Default module configuration for new companies.
 */
export declare const COMPANY_MODULE_DEFAULTS: readonly [{
    readonly code: "platform";
    readonly enabled: true;
    readonly config: {};
}, {
    readonly code: "pos";
    readonly enabled: true;
    readonly config: {
        readonly payment_methods: readonly ["CASH"];
    };
}, {
    readonly code: "sales";
    readonly enabled: true;
    readonly config: {};
}, {
    readonly code: "inventory";
    readonly enabled: true;
    readonly config: {
        readonly level: 0;
    };
}, {
    readonly code: "purchasing";
    readonly enabled: false;
    readonly config: {};
}, {
    readonly code: "treasury";
    readonly enabled: true;
    readonly config: {};
}, {
    readonly code: "accounting";
    readonly enabled: true;
    readonly config: {};
}, {
    readonly code: "reservations";
    readonly enabled: true;
    readonly config: {};
}, {
    readonly code: "payments";
    readonly enabled: true;
    readonly config: {};
}, {
    readonly code: "reports";
    readonly enabled: true;
    readonly config: {};
}, {
    readonly code: "settings";
    readonly enabled: true;
    readonly config: {};
}, {
    readonly code: "accounts";
    readonly enabled: true;
    readonly config: {};
}, {
    readonly code: "journals";
    readonly enabled: true;
    readonly config: {};
}];
//# sourceMappingURL=module-definitions.d.ts.map