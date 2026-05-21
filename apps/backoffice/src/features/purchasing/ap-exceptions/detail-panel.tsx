// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Badge, Card, Drawer, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";

import type { ApException } from "./types";

function DetailField(props: { label: string; value: string | number | null | undefined }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" tt="uppercase">{props.label}</Text>
      <Text size="sm">{props.value == null || props.value === "" ? "—" : props.value}</Text>
    </Stack>
  );
}

function statusBadgeColor(status: ApException["status"]): string {
  switch (status) {
    case "OPEN": return "orange";
    case "ASSIGNED": return "blue";
    case "RESOLVED": return "green";
    case "DISMISSED": return "gray";
  }
}

export function ApExceptionDetailPanel(props: { opened: boolean; exception: ApException | null; onClose: () => void }) {
  return (
    <Drawer opened={props.opened} onClose={props.onClose} title="AP exception detail" position="right" size="lg" withinPortal={false}>
      {props.exception ? (
        <Stack gap="md">
          <Card withBorder radius="md" p="md">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Title order={3}>{props.exception.exception_key}</Title>
                  <Text size="sm" c="dimmed">Row-based detail from loaded worklist data only.</Text>
                </div>
                <Badge color={statusBadgeColor(props.exception.status)}>{props.exception.status}</Badge>
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <DetailField label="Type" value={props.exception.type} />
                <DetailField label="Source" value={`${props.exception.source_type} #${props.exception.source_id}`} />
                <DetailField label="Supplier ID" value={props.exception.supplier_id} />
                <DetailField label="Variance" value={props.exception.variance_amount} />
                <DetailField label="Currency" value={props.exception.currency_code} />
                <DetailField label="Detected at" value={props.exception.detected_at} />
                <DetailField label="Due date" value={props.exception.due_date} />
                <DetailField label="Assigned user" value={props.exception.assigned_to_user_id} />
                <DetailField label="Assigned at" value={props.exception.assigned_at} />
                <DetailField label="Resolved at" value={props.exception.resolved_at} />
                <DetailField label="Resolved by" value={props.exception.resolved_by_user_id} />
                <DetailField label="Updated at" value={props.exception.updated_at} />
              </SimpleGrid>
              <DetailField label="Resolution note" value={props.exception.resolution_note} />
            </Stack>
          </Card>
        </Stack>
      ) : (
        <Text c="dimmed">Select an exception row to view details.</Text>
      )}
    </Drawer>
  );
}
