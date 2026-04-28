// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Hono } from "hono";
import { accountingReportRoutes } from "./reports/index.js";

const accountingRoutes = new Hono();

accountingRoutes.route("/reports", accountingReportRoutes);

export { accountingRoutes };