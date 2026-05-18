// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Alert,
  Box,
  Group,
  LoadingOverlay,
  Paper,
  Select,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import React, { useMemo } from "react";

import { AuditTimeline } from "@/features/audit/audit-timeline";
import { dateStringToEpochMs, nextDayEpochMs } from "@/features/audit/audit-helpers";
import { useAuditEntityLog } from "@/hooks/use-audit-entity-log";
import type { SessionUser } from "@/lib/session";

function useQueryParam(key: string, defaultValue = ""): [string, (value: string) => void] {
  const getParam = () => {
    const params = new URLSearchParams(globalThis.location.hash.split("?")[1] ?? "");
    return params.get(key) ?? defaultValue;
  };

  const [value, setValue] = React.useState(getParam);

  React.useEffect(() => {
    const handleHashChange = () => setValue(getParam());
    globalThis.addEventListener("hashchange", handleHashChange);
    return () => globalThis.removeEventListener("hashchange", handleHashChange);
  }, [key]);

  const setParam = (next: string) => {
    setValue(next);
    const hashParts = globalThis.location.hash.split("?");
    const base = hashParts[0] ?? "#";
    const params = new URLSearchParams(hashParts[1] ?? "");
    if (next) {
      params.set(key, next);
    } else {
      params.delete(key);
    }
    const query = params.toString();
    globalThis.location.hash = query ? `${base}?${query}` : base;
  };

  return [value, setParam];
}

function useNumberQueryParam(key: string): [number | undefined, (value: number | undefined) => void] {
  const [raw, setRaw] = useQueryParam(key, "");
  const value = raw ? Number(raw) : undefined;
  const setValue = (next: number | undefined) => setRaw(next?.toString() ?? "");
  return [Number.isFinite(value) ? value : undefined, setValue];
}

type AuditExplorerPageProps = {
  user: SessionUser;
};

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
  { value: "VOID", label: "Void" },
  { value: "REFUND", label: "Refund" },
];

export function AuditExplorerPage({ user }: AuditExplorerPageProps) {
  const companyId = user.company_id;
  const [objectType, setObjectType] = useQueryParam("objectType", "");
  const [objectId, setObjectId] = useQueryParam("objectId", "");
  const [action, setAction] = useQueryParam("action", "");
  const [actorUserId, setActorUserId] = useNumberQueryParam("actorUserId");
  const [fromDate, setFromDate] = useQueryParam("fromDate", "");
  const [toDate, setToDate] = useQueryParam("toDate", "");

  const hasEntityScope = objectType.length > 0 && objectId.length > 0;

  const startDate = fromDate ? dateStringToEpochMs(fromDate) : undefined;
  const endDate = toDate ? nextDayEpochMs(toDate) : undefined;

  const { data, isLoading, isError } = useAuditEntityLog({
    objectType,
    objectId,
    companyId,
    action: action || undefined,
    actorUserId,
    startDate: startDate && startDate > 0 ? startDate : undefined,
    endDate: endDate && endDate > 0 ? endDate : undefined,
  });

  const entries = useMemo(() => data?.logs ?? [], [data]);

  return (
    <Stack gap="md" p="md" data-testid="audit-explorer-page">
      <Group gap="xs">
        <IconHistory size={24} />
        <Title order={3}>Audit Trail</Title>
      </Group>

      <Paper p="sm" withBorder
        style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <TextInput
          label="Entity Type"
          placeholder="e.g. item, invoice"
          value={objectType}
          onChange={(event) => setObjectType(event.currentTarget.value)}
          style={{ minWidth: 160 }}
        />
        <TextInput
          label="Entity ID"
          placeholder="e.g. 42"
          value={objectId}
          onChange={(event) => setObjectId(event.currentTarget.value)}
          style={{ minWidth: 120 }}
        />
        <Select
          label="Action"
          data={ACTION_OPTIONS}
          value={action}
          onChange={(value) => setAction(value ?? "")}
          style={{ minWidth: 160 }}
        />
        <TextInput
          label="Actor User ID"
          placeholder="e.g. 20"
          value={actorUserId?.toString() ?? ""}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            const parsed = raw ? Number(raw) : undefined;
            setActorUserId(
              typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0
                ? parsed
                : undefined,
            );
          }}
          style={{ minWidth: 140 }}
        />
        <TextInput
          label="From Date"
          placeholder="YYYY-MM-DD"
          value={fromDate}
          onChange={(event) => setFromDate(event.currentTarget.value)}
          style={{ minWidth: 140 }}
        />
        <TextInput
          label="To Date"
          placeholder="YYYY-MM-DD"
          value={toDate}
          onChange={(event) => setToDate(event.currentTarget.value)}
          style={{ minWidth: 140 }}
        />
      </Paper>

      {!hasEntityScope && (
        <Alert color="blue" variant="light">
          Enter an entity type and ID above to view the audit trail for that entity.
        </Alert>
      )}

      {isError && (
        <Alert color="red" variant="light">
          Failed to load audit history. Please try again.
        </Alert>
      )}

      {hasEntityScope && (
        <Box pos="relative">
          <LoadingOverlay visible={isLoading} />
          <AuditTimeline
            entries={entries}
            loading={isLoading}
            emptyMessage={`No changes recorded for ${objectType} ${objectId}`}
          />
        </Box>
      )}
    </Stack>
  );
}
