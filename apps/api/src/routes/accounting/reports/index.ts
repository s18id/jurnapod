// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Hono } from "hono";
import arReconciliationRoutes from "./ar-reconciliation.js";

const accountingReportRoutes = new Hono();

accountingReportRoutes.route("/ar-reconciliation", arReconciliationRoutes);

export { accountingReportRoutes };