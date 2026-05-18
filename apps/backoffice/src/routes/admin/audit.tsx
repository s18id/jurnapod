// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { AuditLogsPage } from "@/features/audit-logs-page";
import type { SessionUser } from "@/lib/session";

type AuditAdminRouteProps = {
  user: SessionUser;
};

export function AuditAdminRoute({ user }: AuditAdminRouteProps) {
  return <AuditLogsPage user={user} />;
}

export default AuditAdminRoute;
