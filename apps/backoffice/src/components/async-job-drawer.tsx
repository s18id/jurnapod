// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Drawer,
  Group,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconLock } from "@tabler/icons-react";

import { useShell } from "@/app/shell";
import { OperationStepper } from "@/components/operation-stepper";
import { useAsyncJobDrawer } from "@/hooks/use-async-job-drawer";
import {
  isTerminalOperationStatus,
  type OperationProgress,
  type OperationProgressState,
  type OperationStatus,
  useOperationProgress,
} from "@/hooks/use-operation-progress";
import { PERMISSION_BITS, userHasPermission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

export interface AsyncJobDrawerProps {
  opened: boolean;
  operationId: string | null;
  operationType?: string | null;
  onClose: () => void;
  user?: SessionUser | null;
  enableSse?: boolean;
  progressState?: OperationProgressState;
}

export function canReadOperations(user: SessionUser | null | undefined): boolean {
  return userHasPermission(user?.permissions ?? [], "platform", "operations", PERMISSION_BITS.READ);
}

export function formatEtaSeconds(etaSeconds: number | null): string {
  if (etaSeconds === null) return "ETA unavailable";
  if (etaSeconds <= 0) return "ETA now";
  if (etaSeconds < 60) return `${etaSeconds}s remaining`;
  const minutes = Math.floor(etaSeconds / 60);
  const seconds = etaSeconds % 60;
  return seconds === 0 ? `${minutes}m remaining` : `${minutes}m ${seconds}s remaining`;
}

export function formatOperationDetails(details: OperationProgress["details"]): string | null {
  if (!details || Object.keys(details).length === 0) return null;
  return JSON.stringify(details, null, 2);
}

export function extractFailureReason(details: OperationProgress["details"]): string {
  if (!details) return "No failure reason was provided by the backend.";
  const reason = details.reason ?? details.message ?? details.error;
  return typeof reason === "string" && reason.trim().length > 0
    ? reason
    : "No failure reason was provided by the backend.";
}

export function getStatusColor(status: OperationStatus): string {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  if (status === "cancelled") return "yellow";
  return "blue";
}

function ProgressSummary({ progress }: { progress: OperationProgress }) {
  const details = formatOperationDetails(progress.details);

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Status</Text>
        <Badge color={getStatusColor(progress.status)} variant="light">{progress.status}</Badge>
      </Group>
      <Progress value={progress.percentage} aria-label="Operation progress" />
      <Group justify="space-between">
        <Text size="sm">{progress.completed} of {progress.total} completed</Text>
        <Text size="sm" fw={600}>{progress.percentage}%</Text>
      </Group>
      <Text size="sm" c="dimmed">{formatEtaSeconds(progress.etaSeconds)}</Text>
      <Text size="xs" c="dimmed">Started: {progress.startedAt}</Text>
      <Text size="xs" c="dimmed">Updated: {progress.updatedAt}</Text>
      {progress.completedAt ? <Text size="xs" c="dimmed">Completed at: {progress.completedAt}</Text> : null}

      {progress.status === "failed" ? (
        <Alert color="red" title="Failure reason" icon={<IconAlertTriangle size={16} />}>
          {extractFailureReason(progress.details)}
        </Alert>
      ) : null}

      {progress.status === "cancelled" ? (
        <Alert color="yellow" title="Operation cancelled">
          Cancelled{progress.completedAt ? ` at ${progress.completedAt}` : ""}.
        </Alert>
      ) : null}

      {progress.status === "completed" ? (
        <Alert color="green" title="Operation completed">
          Completed {progress.completed} of {progress.total} records.
        </Alert>
      ) : null}

      {details ? (
        <Box>
          <Text size="sm" fw={600} mb={4}>Details</Text>
          <Code block>{details}</Code>
        </Box>
      ) : null}

      {isTerminalOperationStatus(progress.status) ? null : (
        <Text size="xs" c="dimmed">Polling continues while the backend reports running.</Text>
      )}
    </Stack>
  );
}

function ErrorState({ state }: { state: OperationProgressState }) {
  const error = state.error;
  if (!error) return null;
  if (error.status === 403) {
    return <Alert color="red" title="Access denied">Access denied</Alert>;
  }
  if (error.status === 404) {
    return <Alert color="red" title="Job not found">Job not found</Alert>;
  }
  return <Alert color="red" title="Failed to load job">{error.message}</Alert>;
}

function AsyncJobDrawerProgressContent(props: {
  operationId: string;
  enableSse: boolean;
  progressState?: OperationProgressState;
}) {
  const hookState = useOperationProgress(props.operationId, {
    enabled: !props.progressState,
    enableSse: props.enableSse,
  });
  const state = props.progressState ?? hookState;
  const progress = state.progress;

  return (
    <>
      {state.loading && !progress ? <Text>Loading operation progress…</Text> : null}
      <ErrorState state={state} />
      {progress ? (
        <>
          <Divider />
          <OperationStepper status={progress.status} />
          <Divider />
          <ProgressSummary progress={progress} />
          <Text size="xs" c="dimmed">Transport: {state.transport}</Text>
        </>
      ) : null}
    </>
  );
}

export function AsyncJobDrawer(props: AsyncJobDrawerProps) {
  const shell = useShell();
  const user = props.user ?? shell.user;
  const hasAccess = canReadOperations(user);
  const progress = props.progressState?.progress;

  return (
    <Drawer
      opened={props.opened}
      onClose={props.onClose}
      title="Async job"
      position="right"
      size="lg"
      withinPortal={false}
      keepMounted={false}
    >
      <Stack gap="md">
        <Box>
          <Title order={3}>Operation progress</Title>
          <Text size="sm" c="dimmed">Operation ID: {props.operationId ?? "None"}</Text>
          <Text size="sm" c="dimmed">Type: {props.operationType ?? "Unknown"}</Text>
          {progress ? <Text size="sm" c="dimmed">Current status: {progress.status}</Text> : null}
        </Box>

        {!hasAccess ? (
          <Alert color="red" title="Access denied" icon={<IconLock size={16} />}>
            Access denied
          </Alert>
        ) : null}

        {hasAccess && !props.operationId ? (
          <Alert color="yellow" title="No operation selected">Open the drawer with an operation ID.</Alert>
        ) : null}

        {hasAccess && props.operationId && props.opened ? (
          <AsyncJobDrawerProgressContent
            key={props.operationId}
            operationId={props.operationId}
            enableSse={props.enableSse ?? false}
            progressState={props.progressState}
          />
        ) : null}

        <Group justify="flex-end">
          <Button variant="light" onClick={props.onClose}>Close</Button>
        </Group>
      </Stack>
    </Drawer>
  );
}

export function AsyncJobDrawerHost() {
  const drawer = useAsyncJobDrawer();
  return (
    <AsyncJobDrawer
      opened={drawer.opened}
      operationId={drawer.operationId}
      operationType={drawer.operationType}
      onClose={drawer.close}
    />
  );
}
