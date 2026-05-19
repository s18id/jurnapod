// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ApiGapNotice, CountMetric, DashboardCard } from "@/features/dashboards/dashboard-card";
import type { DashboardPermissions } from "@/features/dashboards/global-admin-overview";
import type { useDashboardData } from "@/hooks/use-dashboard-data";
import type { SessionUser } from "@/lib/session";

const DRAFT_PREFIX = "jurnapod.backoffice.draft";

export function getScopedDraftStoragePrefix(companyId: number, userId: number): string {
  return `${DRAFT_PREFIX}.${companyId}.${userId}.`;
}

export function getScopedDraftCount(companyId: number, userId: number, storage: Storage | undefined = globalThis.localStorage): number {
  if (!storage) return 0;
  const prefix = getScopedDraftStoragePrefix(companyId, userId);
  let count = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) count += 1;
  }
  return count;
}

export function MyWorkPanel(props: {
  user: SessionUser;
  permissions: DashboardPermissions;
  dashboard: ReturnType<typeof useDashboardData>;
}) {
  const draftCount = getScopedDraftCount(props.user.company_id, props.user.id);

  return (
    <section>
      <h2>My Work</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {props.permissions.canReadOperations ? (
          <DashboardCard
            title="Company Recent Jobs"
            description="Recent operations are company-scoped; operations rows have no user owner."
            href="#/operations"
            state={
              props.dashboard.recentJobs.isLoading
                ? { status: "loading" }
                : props.dashboard.recentJobs.isError
                  ? { status: "error", message: props.dashboard.recentJobs.error?.message ?? "Unable to load recent jobs", retry: () => void props.dashboard.recentJobs.refetch() }
                  : (props.dashboard.recentJobs.data?.operations.length ?? 0) === 0
                    ? { status: "empty", message: "No company recent jobs" }
                    : {
                        status: "success",
                        children: (
                          <ul>
                            {props.dashboard.recentJobs.data?.operations.map((operation) => (
                              <li key={operation.operationId}>
                                <a href={`#/operations?operationId=${encodeURIComponent(operation.operationId)}`}>
                                  {operation.type} — {operation.status}
                                </a>
                              </li>
                            ))}
                          </ul>
                        ),
                      }
            }
          />
        ) : null}

        <DashboardCard
          title="Pending Approvals"
          description="Approval tasks"
          state={{ status: "api-gap", message: "Approvals workflow not available yet" }}
        />

        <DashboardCard
          title="Saved Drafts"
          description="Unsaved browser drafts scoped by company and user"
          state={{
            status: "success",
            children: <CountMetric label="saved drafts" value={draftCount} tone={draftCount > 0 ? "warn" : "good"} />,
          }}
        />

        <DashboardCard
          title="Validation Failures"
          description="Import validation tasks"
          state={{
            status: "success",
            children: <ApiGapNotice message="Validation failure task source is not available for this dashboard yet." />,
          }}
        />
      </div>
    </section>
  );
}
