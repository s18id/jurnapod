// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Button, Group, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

import type { BackofficeNotification } from "@/features/notifications/notification-types";
import { useNotifications } from "@/hooks/use-notifications";

export function NotificationBanner() {
  const { activeBanner, acknowledgeBanner } = useNotifications();

  if (!activeBanner) return null;

  return <NotificationBannerView activeBanner={activeBanner} onAcknowledge={acknowledgeBanner} />;
}

export function NotificationBannerView({
  activeBanner,
  onAcknowledge,
}: {
  activeBanner: BackofficeNotification;
  onAcknowledge: (id: string) => void;
}) {
  return (
    <Alert
      color={activeBanner.type === "error" ? "red" : "yellow"}
      icon={<IconAlertTriangle size={18} />}
      radius={0}
      aria-live="assertive"
      data-testid="notification-banner"
    >
      <Group justify="space-between" gap="md" wrap="nowrap">
        <div>
          <Text fw={700}>{activeBanner.title}</Text>
          <Text size="sm">{activeBanner.message}</Text>
        </div>
        <Button
          size="xs"
          variant="white"
          color={activeBanner.type === "error" ? "red" : "yellow"}
          onClick={() => onAcknowledge(activeBanner.id)}
        >
          Acknowledge
        </Button>
      </Group>
    </Alert>
  );
}
