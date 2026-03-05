// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useState } from "react";
import { Stack, Table, Text, Badge } from "@mantine/core";
import { PageCard } from "../components/PageCard";
import { db, type SyncHistory } from "../lib/offline-db";
import type { SessionUser } from "../lib/session";

type SyncHistoryPageProps = {
  user: SessionUser;
};

export function SyncHistoryPage({ user }: SyncHistoryPageProps) {
  const [history, setHistory] = useState<SyncHistory[]>([]);

  useEffect(() => {
    async function loadHistory() {
      const logs = await db.syncHistory.where("userId").equals(user.id).toArray();
      const sorted = logs.sort(
        (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      );
      setHistory(sorted.slice(0, 50));
    }

    loadHistory().catch(() => undefined);
  }, [user.id]);

  return (
    <Stack gap="md">
      <PageCard
        title="Sync History"
        description="Recent sync actions for offline transactions"
      >
        {history.length === 0 ? (
          <Text c="dimmed">No sync history yet.</Text>
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Time</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th ta="right">Items</Table.Th>
                <Table.Th>Details</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history.map((log) => (
                <Table.Tr key={log.id}>
                  <Table.Td>{new Date(log.timestamp).toLocaleString("id-ID")}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        log.action === "sync_success"
                          ? "green"
                          : log.action === "sync_failed"
                            ? "red"
                            : "blue"
                      }
                    >
                      {log.action}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right">{log.itemCount}</Table.Td>
                  <Table.Td>{log.details}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </PageCard>
    </Stack>
  );
}
