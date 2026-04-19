// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Hono } from "hono";
import { apAgingRoutes } from "./ap-aging.js";
import { apReconciliationRoutes } from "./ap-reconciliation.js";

const purchasingReportRoutes = new Hono();

purchasingReportRoutes.route("/ap-aging", apAgingRoutes);
purchasingReportRoutes.route("/ap-reconciliation", apReconciliationRoutes);

export { purchasingReportRoutes };
