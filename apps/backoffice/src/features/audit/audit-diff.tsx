// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Box, Code, Table, Text } from "@mantine/core";

export type DiffField = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

export type AuditDiffProps = {
  changesJson: string;
  maxFields?: number;
};

export function parseAuditChanges(
  changesJson: string,
): DiffField[] {
  try {
    const parsed = JSON.parse(changesJson) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];

    return Object.entries(parsed).map(([field, value]) => {
      const entry = value as { old?: unknown; new?: unknown } | unknown;
      if (
        typeof entry === "object" &&
        entry !== null &&
        ("old" in entry || "new" in entry)
      ) {
        const typed = entry as { old?: unknown; new?: unknown };
        return { field, oldValue: typed.old, newValue: typed.new };
      }
      return { field, oldValue: entry, newValue: entry };
    });
  } catch {
    return [];
  }
}

export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function AuditDiff({ changesJson, maxFields = 50 }: AuditDiffProps) {
  const fields = parseAuditChanges(changesJson);
  const displayFields = fields.slice(0, maxFields);

  if (fields.length === 0) {
    return (
      <Text c="dimmed" size="sm" data-testid="audit-diff-empty">
        No detailed changes available.
      </Text>
    );
  }

  return (
    <Box data-testid="audit-diff">
      <Table striped highlightOnHover withTableBorder
        layout="fixed"
        style={{ tableLayout: "fixed" }}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: "30%" }}>Field</Table.Th>
            <Table.Th style={{ width: "35%" }}>Before</Table.Th>
            <Table.Th style={{ width: "35%" }}>After</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {displayFields.map((diff) => (
            <Table.Tr key={diff.field}>
              <Table.Td>
                <Text size="sm" fw={600}>{diff.field}</Text>
              </Table.Td>
              <Table.Td>
                <Code block style={{ wordBreak: "break-word" }}>
                  {formatDiffValue(diff.oldValue)}
                </Code>
              </Table.Td>
              <Table.Td>
                <Code block style={{ wordBreak: "break-word" }}>
                  {formatDiffValue(diff.newValue)}
                </Code>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {fields.length > maxFields && (
        <Text size="xs" c="dimmed" mt="xs">
          +{fields.length - maxFields} more fields not shown.
        </Text>
      )}
    </Box>
  );
}
