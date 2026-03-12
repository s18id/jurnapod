// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useState } from "react";
import { Stack, Table, Button, Group, Text, Badge, Alert } from "@mantine/core";
import { PageCard } from "../components/PageCard";
import { OutboxService } from "../lib/outbox-service";
import type { SessionUser } from "../lib/session";
import type { OutboxItem } from "../lib/offline-db";
import { ConflictDialog } from "../components/conflict-dialog";

function formatDateTime(value: Date) {
  return new Date(value).toLocaleString("id-ID");
}

type SyncQueuePageProps = {
  user: SessionUser;
};

export function SyncQueuePage({ user }: SyncQueuePageProps) {
  const [queue, setQueue] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [conflictItem, setConflictItem] = useState<OutboxItem | null>(null);

  async function loadQueue() {
    setLoading(true);
    try {
      const items = await OutboxService.getAllItems(user.id);
      setQueue(items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQueue().catch(() => undefined);
  }, [user.id]);

  async function handleDelete(id: string) {
    if (!window.confirm("This will permanently discard the transaction. It will never be synced and cannot be recovered. Continue?")) {
      return;
    }
    const deleted = await OutboxService.deleteFailedItem(id, user.id);
    if (!deleted) {
      window.alert("Cannot delete: item is not in failed state or does not belong to you.");
      return;
    }
    await loadQueue();
  }

  return (
    <Stack gap="md">
      <PageCard
        title="Sync Queue"
        description="Transactions saved offline and pending sync"
      >
        {loading ? (
          <Alert>Loading queue...</Alert>
        ) : queue.length === 0 ? (
          <Text c="dimmed">No queued transactions.</Text>
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Error</Table.Th>
                <Table.Th ta="center">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {queue.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Badge variant="light">{item.type}</Badge>
                  </Table.Td>
                  <Table.Td>{formatDateTime(item.timestamp)}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        item.status === "pending"
                          ? "yellow"
                          : item.status === "failed"
                            ? "red"
                            : "blue"
                      }
                    >
                      {item.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{item.error ?? "-"}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="center">
                      {item.status === "failed" ? (
                        <>
                          <Button size="xs" variant="light" onClick={() => setConflictItem(item)}>
                            Review
                          </Button>
                          <Button size="xs" color="red" onClick={() => handleDelete(item.id)}>
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </PageCard>
      {conflictItem ? (
        <ConflictDialog
          item={conflictItem}
          onClose={() => setConflictItem(null)}
          onResolve={async (action) => {
            if (action === "discard") {
              const deleted = await OutboxService.deleteFailedItem(conflictItem.id, user.id);
              if (!deleted) {
                window.alert("Cannot discard: item is not in failed state.");
              }
            }
            if (action === "keep") {
              await OutboxService.updateStatus(
                conflictItem.id,
                user.id,
                "failed",
                conflictItem.error
              );
            }
            if (action === "edit") {
              if (conflictItem.type === "journal") {
                window.location.hash = "#/transactions";
              } else if (conflictItem.type === "invoice") {
                window.location.hash = "#/sales-invoices";
              } else if (conflictItem.type === "payment") {
                window.location.hash = "#/sales-payments";
              }
            }
            setConflictItem(null);
            await loadQueue();
          }}
        />
      ) : null}
    </Stack>
  );
}
