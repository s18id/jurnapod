// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing Routes Index
 *
 * Aggregates all purchasing module routes:
 * - /purchasing/suppliers - Supplier CRUD
 * - /purchasing/suppliers/:id/contacts - Supplier contact management
 */

import { Hono } from "hono";
import { supplierRoutes } from "./suppliers.js";
import { supplierContactRoutes } from "./supplier-contacts.js";
import { exchangeRateRoutes } from "./exchange-rates.js";
import { orderRoutes } from "./purchase-orders.js";
import { receiptRoutes } from "./goods-receipts.js";
import { invoiceRoutes } from "./purchase-invoices.js";
import { paymentRoutes } from "./ap-payments.js";
import { creditRoutes } from "./purchase-credits.js";
import { purchasingReportRoutes } from "./reports/index.js";
import { supplierStatementRoutes } from "./supplier-statements.js";

const purchasingRoutes = new Hono();

// Mount supplier routes
purchasingRoutes.route("/suppliers", supplierRoutes);

// Mount supplier contact routes under /purchasing/suppliers/:supplierId/contacts
purchasingRoutes.route("/suppliers", supplierContactRoutes);

// Mount exchange rate routes
purchasingRoutes.route("/exchange-rates", exchangeRateRoutes);

// Mount purchase order routes
purchasingRoutes.route("/orders", orderRoutes);

// Mount goods receipt routes
purchasingRoutes.route("/receipts", receiptRoutes);

// Mount purchase invoice routes
purchasingRoutes.route("/invoices", invoiceRoutes);

// Mount AP payment routes
purchasingRoutes.route("/payments", paymentRoutes);

// Mount purchase credit routes
purchasingRoutes.route("/credits", creditRoutes);

// Mount purchasing report routes
purchasingRoutes.route("/reports", purchasingReportRoutes);

// Mount supplier statement routes
purchasingRoutes.route("/supplier-statements", supplierStatementRoutes);

export { purchasingRoutes };
