// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Button, Group, Modal, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useState } from "react";

import type { ApException, ApExceptionResolutionStatus } from "./types";

export function formatApExceptionApiError(error: unknown): string {
  if (typeof error === "object" && error !== null && "status" in error && "code" in error && "message" in error) {
    const err = error as { status?: unknown; code?: unknown; message?: unknown };
    if (err.status === 403) return `${String(err.code)}: Permission denied for AP exception worklist.`;
    if (err.status === 404) return `${String(err.code)}: AP exception was not found or is no longer available for this company.`;
    if (err.status === 409) return `${String(err.code)}: AP exception changed state. Refresh the worklist before retrying.`;
    return `${String(err.code)}: ${String(err.message)}`;
  }
  if (error instanceof Error) return error.message;
  return "UNKNOWN_ERROR: AP exception request failed";
}

export function AssignExceptionModal(props: {
  opened: boolean;
  exception: ApException | null;
  submitting: boolean;
  submitError?: string | null;
  onClose: () => void;
  onSubmit: (assignedToUserId: number) => Promise<boolean>;
}) {
  const [assignedUserId, setAssignedUserId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = assignedUserId.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0) {
      setValidationError("Assigned user ID must be a positive number.");
      return;
    }
    setValidationError(null);
    const ok = await props.onSubmit(Number(trimmed));
    if (ok) setAssignedUserId("");
  }

  return (
    <Modal opened={props.opened} onClose={props.onClose} title="Assign AP exception" withinPortal={false}>
      <Stack gap="md">
        {props.exception ? <Text size="sm">Assign {props.exception.exception_key}</Text> : null}
        {props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}
        {validationError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{validationError}</Alert> : null}
        <TextInput
          label="Assigned user ID"
          value={assignedUserId}
          onChange={(event) => setAssignedUserId(event.currentTarget.value)}
          inputMode="numeric"
          required
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={props.onClose}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} loading={props.submitting}>Assign</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function ResolveExceptionModal(props: {
  opened: boolean;
  exception: ApException | null;
  action: ApExceptionResolutionStatus;
  submitting: boolean;
  submitError?: string | null;
  onClose: () => void;
  onSubmit: (resolutionNote: string) => Promise<boolean>;
}) {
  const [resolutionNote, setResolutionNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = resolutionNote.trim();
    if (!trimmed) {
      setValidationError("Resolution note is required.");
      return;
    }
    setValidationError(null);
    const ok = await props.onSubmit(trimmed);
    if (ok) setResolutionNote("");
  }

  return (
    <Modal opened={props.opened} onClose={props.onClose} title={`${props.action === "RESOLVED" ? "Resolve" : "Dismiss"} AP exception`} withinPortal={false}>
      <Stack gap="md">
        {props.exception ? <Text size="sm">{props.action === "RESOLVED" ? "Resolve" : "Dismiss"} {props.exception.exception_key}</Text> : null}
        {props.submitError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{props.submitError}</Alert> : null}
        {validationError ? <Alert color="red" icon={<IconAlertCircle size={16} />}>{validationError}</Alert> : null}
        <Textarea
          label="Resolution note"
          value={resolutionNote}
          onChange={(event) => setResolutionNote(event.currentTarget.value)}
          minRows={4}
          required
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={props.onClose}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} loading={props.submitting} color={props.action === "DISMISSED" ? "gray" : "green"}>
            {props.action === "RESOLVED" ? "Resolve" : "Dismiss"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
