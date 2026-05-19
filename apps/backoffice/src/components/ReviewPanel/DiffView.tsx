import { Badge, Table, Text } from "@mantine/core";

import type { DiffChange } from "@/lib/diff-engine";
import { diffValues } from "@/lib/diff-engine";

export interface DiffViewProps {
  changes?: DiffChange[];
  oldValue?: unknown;
  newValue?: unknown;
  moneyFields?: string[];
  dateFields?: string[];
  moneyPrecision?: number;
}

const CHANGE_COLORS: Record<DiffChange["kind"], string> = {
  added: "green",
  deleted: "red",
  changed: "yellow",
  reordered: "blue",
};

export function DiffView({ changes, oldValue, newValue, moneyFields, dateFields, moneyPrecision }: DiffViewProps) {
  const rows = changes ?? diffValues(oldValue, newValue, { moneyFields, dateFields, moneyPrecision });
  if (rows.length === 0) {
    return <Text c="dimmed" aria-live="polite">No changes to review.</Text>;
  }
  return (
    <Table striped withTableBorder aria-label="Before and after changes">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Field</Table.Th>
          <Table.Th>Change</Table.Th>
          <Table.Th>Before</Table.Th>
          <Table.Th>After</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((change) => (
          <Table.Tr key={`${change.path}-${change.kind}`}>
            <Table.Td>{change.label}</Table.Td>
            <Table.Td><Badge color={CHANGE_COLORS[change.kind]}>{change.kind}</Badge></Table.Td>
            <Table.Td>{change.oldFormatted}</Table.Td>
            <Table.Td>{change.newFormatted}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
