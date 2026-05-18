// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconArrowLeft, IconHistory } from "@tabler/icons-react";

import { StatusBadge } from "@/components/data-grid";
import { useItemDetail } from "@/hooks/use-item-detail";
import { useItemGroups } from "@/hooks/use-item-groups";
import type { SessionUser } from "@/lib/session";

export interface ItemDetailPageProps {
  user: SessionUser;
  itemId: number;
}

function formatOptional(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function ItemDetailPage({ user, itemId }: ItemDetailPageProps) {
  const itemQuery = useItemDetail(itemId);
  const { groupMap } = useItemGroups({ user });
  const item = itemQuery.data;
  const groupName = item ? groupMap.get(item.item_group_id ?? -1)?.name ?? "-" : "-";

  if (itemQuery.isLoading) {
    return (
      <Stack gap="md" p="md">
        <Title order={2}>Item Detail</Title>
        <Group justify="center" py="xl"><Loader /><Text>Loading item...</Text></Group>
      </Stack>
    );
  }

  if (itemQuery.error || !item) {
    return (
      <Stack gap="md" p="md">
        <Button component="a" href="#/items" variant="subtle" leftSection={<IconArrowLeft size={16} />}>Back to Items</Button>
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Error loading item">
          {itemQuery.error instanceof Error ? itemQuery.error.message : "Item not found"}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md" p="md" data-testid="item-detail-page">
      <Group justify="space-between" align="center">
        <div>
          <Button component="a" href="#/items" variant="subtle" leftSection={<IconArrowLeft size={16} />} mb="xs">Back to Items</Button>
          <Title order={2}>{item.name}</Title>
          <Text size="sm" c="dimmed">{formatOptional(item.sku)}</Text>
        </div>
        <StatusBadge status={item.is_active ? "Active" : "Inactive"} colorMap={{ active: "green", inactive: "red" }} />
      </Group>

      <Card withBorder data-testid="item-general-info-card">
        <Stack gap="xs">
          <Title order={3}>General Info</Title>
          <Group justify="space-between"><Text c="dimmed">SKU</Text><Text fw={500}>{formatOptional(item.sku)}</Text></Group>
          <Group justify="space-between"><Text c="dimmed">Name</Text><Text fw={500}>{item.name}</Text></Group>
          <Group justify="space-between"><Text c="dimmed">Type</Text><Badge variant="light">{item.type}</Badge></Group>
          <Group justify="space-between"><Text c="dimmed">Item Group</Text><Text fw={500}>{groupName}</Text></Group>
          <Group justify="space-between"><Text c="dimmed">Updated At</Text><Text fw={500}>{formatOptional(item.updated_at)}</Text></Group>
        </Stack>
      </Card>

      <Card withBorder data-testid="item-pricing-section">
        <Stack gap="xs">
          <Title order={3}>Pricing</Title>
          <Text size="sm" c="dimmed">Read-only pricing summary. Full pricing management is available from Manage Prices.</Text>
          {item.type === "PRODUCT" ? <Text size="sm">Default price: managed in pricing records.</Text> : null}
        </Stack>
      </Card>

      {item.type === "RECIPE" && (
        <Card withBorder data-testid="item-recipe-ingredients-section">
          <Stack gap="xs">
            <Title order={3}>Recipe Ingredients</Title>
            <Text size="sm" c="dimmed">Read-only recipe ingredients are available through the recipe composition manager.</Text>
          </Stack>
        </Card>
      )}

      {item.type === "INGREDIENT" && (
        <Card withBorder data-testid="item-stock-tracking-section">
          <Stack gap="xs">
            <Title order={3}>Stock Tracking</Title>
            <Text size="sm" c="dimmed">Stock tracking status is managed by inventory and variant records.</Text>
          </Stack>
        </Card>
      )}

      <Button component="a" href={`#/audit-logs?resource=inventory.items&entity_id=${item.id}`} variant="light" leftSection={<IconHistory size={16} />} data-testid="item-audit-trail-link">
        Audit Trail
      </Button>
    </Stack>
  );
}
