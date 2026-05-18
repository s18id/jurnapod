// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Badge,
  Box,
  Group,
  Stack,
  Text,
  Timeline,
  type BadgeProps,
} from "@mantine/core";
import {
  IconCheck,
  IconCircleOff,
  IconFilePlus,
  IconPencil,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import type { AuditLogRecord } from "@/features/audit/api";

export type AuditTimelineProps = {
  entries: AuditLogRecord[];
  loading?: boolean;
  emptyMessage?: string;
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  CREATE: <IconFilePlus size={14} />,
  UPDATE: <IconPencil size={14} />,
  DELETE: <IconTrash size={14} />,
  VOID: <IconCircleOff size={14} />,
  REFUND: <IconX size={14} />,
};

const ACTION_COLORS: Record<string, BadgeProps["color"]> = {
  CREATE: "green",
  UPDATE: "blue",
  DELETE: "red",
  VOID: "orange",
  REFUND: "pink",
};

function formatAuditTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function getActionBadge(action: string): { label: string; color: BadgeProps["color"] } {
  const normalized = action.toUpperCase();
  return {
    label: normalized,
    color: ACTION_COLORS[normalized] ?? "gray",
  };
}

export function AuditTimeline({
  entries,
  loading = false,
  emptyMessage = "No changes recorded for this entity",
}: AuditTimelineProps) {
  if (loading) {
    return (
      <Box p="md" data-testid="audit-timeline-loading">
        <Text c="dimmed" size="sm">Loading audit history...</Text>
      </Box>
    );
  }

  if (entries.length === 0) {
    return (
      <Box p="md" data-testid="audit-timeline-empty">
        <Text c="dimmed" size="sm" ta="center">{emptyMessage}</Text>
      </Box>
    );
  }

  const sorted = [...entries].sort((left, right) => {
    const leftTs = Date.parse(left.created_at);
    const rightTs = Date.parse(right.created_at);
    if (Number.isNaN(leftTs) || Number.isNaN(rightTs)) return 0;
    return rightTs - leftTs;
  });

  return (
    <Timeline bulletSize={24} lineWidth={2} data-testid="audit-timeline">
      {sorted.map((entry) => {
        const badge = getActionBadge(entry.action);
        const icon = ACTION_ICONS[badge.label] ?? <IconCheck size={14} />;

        return (
          <Timeline.Item
            key={entry.id}
            bullet={icon}
            title={
              <Group gap="xs" wrap="nowrap">
                <Badge size="sm" color={badge.color} variant="light">
                  {badge.label}
                </Badge>
                <Text size="sm" fw={600}>
                  {entry.entity_type ?? "Unknown"} {entry.entity_id ?? ""}
                </Text>
              </Group>
            }
          >
            <Stack gap={4}>
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  By user {entry.user_id ?? "system"}
                </Text>
                <Text size="xs" c="dimmed">•</Text>
                <Text size="xs" c="dimmed">
                  {formatAuditTimestamp(entry.created_at)}
                </Text>
              </Group>
              {entry.changes_json && (
                <AuditDiffPreview changesJson={entry.changes_json} />
              )}
            </Stack>
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}

function AuditDiffPreview({ changesJson }: { changesJson: string }) {
  let changes: Record<string, { old?: unknown; new?: unknown }> | null = null;
  try {
    const parsed = JSON.parse(changesJson) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      changes = parsed as Record<string, { old?: unknown; new?: unknown }>;
    }
  } catch {
    // Ignore malformed JSON.
  }

  if (!changes) return null;

  const fields = Object.entries(changes).slice(0, 3);

  return (
    <Box mt={4}>
      {fields.map(([field, diff]) => (
        <Text key={field} size="xs" c="dimmed">
          <Text span fw={600}>{field}:</Text>{" "}
          {String(diff?.old ?? "—")} → {String(diff?.new ?? "—")}
        </Text>
      ))}
      {Object.keys(changes).length > 3 && (
        <Text size="xs" c="dimmed">
          +{Object.keys(changes).length - 3} more fields
        </Text>
      )}
    </Box>
  );
}
