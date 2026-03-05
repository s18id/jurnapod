// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Modal, Stack, Text, Button, Group, Badge } from "@mantine/core";
import type { OutboxItem } from "../lib/offline-db";

type ConflictDialogProps = {
  item: OutboxItem;
  onResolve: (action: "keep" | "discard" | "edit") => void;
  onClose: () => void;
};

export function ConflictDialog({ item, onResolve, onClose }: ConflictDialogProps) {
  return (
    <Modal opened onClose={onClose} title="Transaction Needs Attention" centered>
      <Stack gap="md">
        <Text c="red" size="sm">
          ⚠️ Data changed while you were offline.
        </Text>
        <Stack gap="xs">
          <Group>
            <Text fw={600} size="sm">Type:</Text>
            <Badge variant="light">{item.type}</Badge>
          </Group>
          <Group>
            <Text fw={600} size="sm">Created:</Text>
            <Text size="sm">{new Date(item.timestamp).toLocaleString("id-ID")}</Text>
          </Group>
          {item.error ? (
            <Group align="flex-start">
              <Text fw={600} size="sm">Error:</Text>
              <Text size="sm" c="red">{item.error}</Text>
            </Group>
          ) : null}
        </Stack>
        <Group gap="xs" justify="flex-end">
          <Button variant="default" onClick={() => onResolve("edit")}>
            Edit Transaction
          </Button>
          <Button variant="light" onClick={() => onResolve("keep")}>
            Keep in Queue
          </Button>
          <Button color="red" onClick={() => onResolve("discard")}>
            Discard
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
