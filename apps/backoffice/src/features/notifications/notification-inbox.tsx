// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Popover,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { IconBell, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import {
  buildNotificationHash,
  type BackofficeNotification,
} from "@/features/notifications/notification-types";
import { useAsyncJobDrawer } from "@/hooks/use-async-job-drawer";
import { useNotifications } from "@/hooks/use-notifications";

type OperationDrawerController = {
  open: (input: { operationId: string; operationType?: string }) => void;
};

export type NotificationOpenTarget = {
  hash: string;
  operationId?: string;
  operationType?: string;
};

export function resolveNotificationOpenTarget(
  notification: BackofficeNotification,
): NotificationOpenTarget | null {
  if (!notification.deepLink) return null;
  const hash = buildNotificationHash(notification.deepLink);
  const operationId = notification.deepLink.params?.operationId;
  const operationType = notification.deepLink.params?.operationType;
  return {
    hash,
    operationId: notification.deepLink.path === "/operations" ? operationId : undefined,
    operationType,
  };
}

export function openNotificationTarget(
  notification: BackofficeNotification,
  drawer: OperationDrawerController,
): NotificationOpenTarget | null {
  const target = resolveNotificationOpenTarget(notification);
  if (!target) return null;
  if (target.operationId) {
    drawer.open({ operationId: target.operationId, operationType: target.operationType });
  }
  globalThis.location.hash = target.hash;
  return target;
}

export function NotificationInbox({ defaultOpened = false }: { defaultOpened?: boolean }) {
  const [opened, setOpened] = useState(defaultOpened);
  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    deleteNotification,
  } = useNotifications();
  const drawer = useAsyncJobDrawer();
  const inboxNotifications = notifications.filter((notification) => notification.layer === "inbox");

  function handleOpen(notification: BackofficeNotification) {
    markRead(notification.id);
    openNotificationTarget(notification, drawer);
    setOpened(false);
  }

  return (
    <Popover width={360} position="bottom-end" shadow="md" withArrow opened={opened} onChange={setOpened}>
      <Popover.Target>
        <ActionIcon
          variant={unreadCount > 0 ? "filled" : "light"}
          color={unreadCount > 0 ? "blue" : "gray"}
          size="lg"
          radius="xl"
          title={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
          aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
          onClick={() => setOpened((current) => !current)}
          data-testid="notification-inbox-button"
        >
          <IconBell size={18} />
          {unreadCount > 0 ? (
            <Badge
              size="xs"
              circle
              color="red"
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                padding: 0,
                fontSize: 10,
                fontWeight: 700,
              }}
              data-testid="notification-unread-badge"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          ) : null}
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <NotificationInboxPanel
          notifications={inboxNotifications}
          unreadCount={unreadCount}
          onOpen={handleOpen}
          onMarkAllRead={markAllRead}
          onDelete={deleteNotification}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

export function NotificationInboxPanel({
  notifications,
  unreadCount,
  onOpen,
  onMarkAllRead,
  onDelete,
}: {
  notifications: BackofficeNotification[];
  unreadCount: number;
  onOpen: (notification: BackofficeNotification) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Stack gap="xs" data-testid="notification-inbox">
      <Group justify="space-between">
        <Text fw={600} size="sm">Notifications</Text>
        <Button size="compact-xs" variant="subtle" onClick={onMarkAllRead} disabled={unreadCount === 0}>
          Mark all read
        </Button>
      </Group>

      {notifications.length === 0 ? (
        <Text c="dimmed" size="sm" ta="center" py="md">No notifications</Text>
      ) : (
        <ScrollArea.Autosize mah={320}>
          <Stack gap="xs">
            {notifications.map((notification) => (
              <Box
                key={notification.id}
                p="xs"
                role="button"
                tabIndex={0}
                data-testid={`notification-item-${notification.id}`}
                onClick={() => onOpen(notification)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onOpen(notification);
                }}
                style={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  backgroundColor: notification.read ? "#f9fafb" : "#eff6ff",
                  cursor: "pointer",
                }}
              >
                <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                  <div>
                    <Group gap={6} mb={4}>
                      {!notification.read ? <Badge size="xs" color="blue">Unread</Badge> : null}
                      <Badge size="xs" variant="light" color={notification.type === "error" ? "red" : notification.type === "success" ? "green" : notification.type === "warning" ? "yellow" : "blue"}>
                        {notification.type}
                      </Badge>
                    </Group>
                    <Text size="sm" fw={600}>{notification.title}</Text>
                    <Text size="xs" c="dimmed" lineClamp={2}>{notification.message}</Text>
                  </div>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    aria-label={`Delete ${notification.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(notification.id);
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Box>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Stack>
  );
}
