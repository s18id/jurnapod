// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Hono } from "hono";
import arReconciliationRoutes from "./ar-reconciliation.js";
import apReconciliationRoutes from "./ap-reconciliation.js";
import inventoryReconciliationRoutes from "./inventory-reconciliation.js";

const accountingReportRoutes = new Hono();

accountingReportRoutes.route("/ar-reconciliation", arReconciliationRoutes);
accountingReportRoutes.route("/ap-reconciliation", apReconciliationRoutes);
accountingReportRoutes.route("/inventory-reconciliation", inventoryReconciliationRoutes);

export { accountingReportRoutes };