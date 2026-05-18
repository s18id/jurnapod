import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AsyncJobDrawer, canReadOperations, formatOperationDetails } from "@/components/async-job-drawer";
import { getOperationLifecycleSteps } from "@/components/operation-stepper";
import type { OperationProgress, OperationProgressState } from "@/hooks/use-operation-progress";
import type { SessionUser } from "@/lib/session";

function makeUser(permissions: SessionUser["permissions"]): SessionUser {
  return {
    id: 1,
    company_id: 10,
    email: "operator@example.com",
    roles: [],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions,
  };
}

function makeProgress(overrides: Partial<OperationProgress> = {}): OperationProgress {
  return {
    operationId: "op-68-1",
    total: 100,
    completed: 40,
    percentage: 40,
    status: "running",
    etaSeconds: 90,
    startedAt: "2026-05-19T00:00:00.000Z",
    updatedAt: "2026-05-19T00:01:00.000Z",
    completedAt: null,
    details: { phase: "rows" },
    ...overrides,
  };
}

function makeState(progress: OperationProgress | null): OperationProgressState {
  return {
    operationId: progress?.operationId ?? null,
    progress,
    loading: false,
    error: null,
    transport: "polling",
  };
}

function renderDrawer(props: {
  user: SessionUser;
  progressState?: OperationProgressState;
  operationId?: string | null;
  operationType?: string | null;
}): string {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(AsyncJobDrawer, {
        opened: true,
        operationId: props.operationId ?? "op-68-1",
        operationType: props.operationType ?? "import",
        onClose: () => undefined,
        user: props.user,
        progressState: props.progressState,
      }),
    ),
  );
}

describe("AsyncJobDrawer", () => {
  const allowedUser = makeUser([{ module: "platform", resource: "operations", mask: 1 }]);
  const deniedUser = makeUser([{ module: "inventory", resource: "items", mask: 63 }]);

  it("gates visibility with platform.operations.READ and no role-name checks", () => {
    expect(canReadOperations(allowedUser)).toBe(true);
    expect(canReadOperations(deniedUser)).toBe(false);
  });

  it("denies operations visibility when explicit backend permissions are absent", () => {
    expect(canReadOperations({ ...makeUser(undefined), roles: ["OWNER"] })).toBe(false);
    expect(canReadOperations(makeUser(undefined))).toBe(false);
  });

  it("renders operation id, type, current status, progress counts, and backend lifecycle", () => {
    const html = renderDrawer({ user: allowedUser, progressState: makeState(makeProgress()) });

    expect(html).toContain("Operation ID: op-68-1");
    expect(html).toContain("Type: import");
    expect(html).toContain("Current status: running");
    expect(html).toContain("40 of 100 completed");
    expect(html).toContain("Running");
    expect(html).toContain("Completed");
    expect(html).not.toContain("queued");
    expect(html).not.toContain("validating");
    expect(html).not.toContain("partially_failed");
  });

  it("renders access denied and suppresses progress for users without platform.operations.READ", () => {
    const html = renderDrawer({ user: deniedUser, progressState: makeState(makeProgress()) });

    expect(html).toContain("Access denied");
    expect(html).not.toContain("40 of 100 completed");
  });

  it("renders completed state with details and completion timestamp", () => {
    const html = renderDrawer({
      user: allowedUser,
      progressState: makeState(makeProgress({
        completed: 100,
        percentage: 100,
        status: "completed",
        etaSeconds: 0,
        completedAt: "2026-05-19T00:02:00.000Z",
        details: { imported: 100 },
      })),
    });

    expect(html).toContain("Operation completed");
    expect(html).toContain("Completed at: 2026-05-19T00:02:00.000Z");
    expect(html).toContain("imported");
  });

  it("renders failed details without generic retry or cancel controls", () => {
    const html = renderDrawer({
      user: allowedUser,
      progressState: makeState(makeProgress({
        status: "failed",
        details: { reason: "Invalid rows" },
      })),
    });

    expect(html).toContain("Failure reason");
    expect(html).toContain("Invalid rows");
    expect(html).not.toContain(">Retry<");
    expect(html).not.toContain(">Cancel<");
  });

  it("renders cancelled state without generic retry controls", () => {
    const html = renderDrawer({
      user: allowedUser,
      progressState: makeState(makeProgress({
        status: "cancelled",
        completedAt: "2026-05-19T00:03:00.000Z",
      })),
    });

    expect(html).toContain("Operation cancelled");
    expect(html).not.toContain(">Retry<");
  });
});

describe("OperationStepper state model", () => {
  it("uses only backend-supported statuses", () => {
    expect(getOperationLifecycleSteps("running").map((step) => step.status)).toEqual(["running", "completed"]);
    expect(getOperationLifecycleSteps("failed").map((step) => step.status)).toEqual(["running", "failed"]);
    expect(getOperationLifecycleSteps("cancelled").map((step) => step.status)).toEqual(["running", "cancelled"]);
  });

  it("formats opaque details without assuming result schemas", () => {
    expect(formatOperationDetails({ warning: "opaque" })).toContain("opaque");
    expect(formatOperationDetails(undefined)).toBeNull();
  });
});
