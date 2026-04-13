// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Container,
  Group,
  NavLink,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Title,
  useMantineTheme
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconBell, IconRefresh, IconAlertTriangle } from "@tabler/icons-react";
import type { ReactNode } from "react";


import { useOnlineStatus } from "../lib/connection";
import type { OutboxItem, AlertReadHistory } from "../lib/offline-db";
import type { SessionUser } from "../lib/session";

import type { AppRoute } from "./routes";

type AppLayoutProps = {
  user: SessionUser;
  routes: readonly AppRoute[];
  activePath: string;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  alertCount: number;
  alertItems: OutboxItem[];
  alertReadItems: AlertReadHistory[];
  alertsLoading: boolean;
  alertsRefreshing: boolean;
  onRefreshAlerts: () => void;
  onMarkAllAlertsRead: () => Promise<void>;
  children: ReactNode;
};

type RuntimeConfig = {
  __JURNAPOD_POS_BASE_URL__?: string;
};

const NAV_GROUPS: Array<{ label: string; paths: string[] }> = [
  {
    label: "Core",
    paths: ["/daily-sales", "/profit-loss", "/general-ledger", "/journals", "/accounting-worksheet"]
  },
  {
    label: "Accounting",
    paths: [
      "/account-types",
      "/chart-of-accounts",
      "/fiscal-years",
      "/account-mappings",
      "/tax-rates",
      "/transaction-templates",
      "/transactions",
      "/cash-bank"
    ]
  },
  {
    label: "Sales",
    paths: ["/sales-invoices", "/sales-payments", "/sales-credit-notes", "/sales-orders"]
  },
  {
    label: "POS",
    paths: [
      "/pos-transactions",
      "/pos-payments",
      "/outlet-tables",
      "/reservations",
      "/reservation-calendar",
      "/table-board",
      "/sync-queue",
      "/sync-history",
      "/pwa-settings"
    ]
  },
  {
    label: "Inventory",
    paths: ["/item-groups", "/items", "/prices", "/supplies", "/fixed-assets", "/inventory-settings"]
  },
  {
    label: "Settings",
    paths: [
      "/audit-logs",
      "/companies",
      "/outlets",
      "/users",
      "/roles",
      "/module-roles",
      "/modules",
      "/outlet-settings",
      "/static-pages",
      "/platform-settings"
    ]
  }
];

function ConnectionStatusBadge() {
  const isOnline = useOnlineStatus();
  return (
    <Badge color={isOnline ? "green" : "red"} variant="light" size="sm">
      {isOnline ? "Online" : "Offline"}
    </Badge>
  );
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolvePosBaseUrl(): string {
  const runtimeConfig = globalThis as RuntimeConfig;
  const runtimeBaseUrl = runtimeConfig.__JURNAPOD_POS_BASE_URL__?.trim();
  if (runtimeBaseUrl) {
    return normalizeBaseUrl(runtimeBaseUrl);
  }

  const envBaseUrl = import.meta.env.VITE_POS_BASE_URL?.trim();
  if (envBaseUrl) {
    return normalizeBaseUrl(envBaseUrl);
  }

  if (typeof window !== "undefined") {
    return normalizeBaseUrl(window.location.origin);
  }

  return "";
}

export function AppLayout(props: AppLayoutProps) {
  const posBaseUrl = resolvePosBaseUrl();
  const theme = useMantineTheme();
  const [opened, { toggle, close }] = useDisclosure();

  return (
    <AppShell
      padding="md"
      header={{ height: 72 }}
      navbar={{ width: 280, breakpoint: "sm", collapsed: { mobile: !opened } }}
      styles={{
        header: {
          backgroundColor: theme.other?.bodyBackgroundAlt ?? theme.white,
          borderBottom: `1px solid ${theme.other?.border ?? theme.colors.gray[3]}`
        },
        navbar: {
          backgroundColor: theme.other?.bodyBackgroundAlt ?? theme.white,
          borderRight: `1px solid ${theme.other?.border ?? theme.colors.gray[3]}`
        }
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Box>
              <Title order={3}>Jurnapod Backoffice</Title>
              <Text size="xs" c="dimmed">
                {props.user.email} · company #{props.user.company_id}
              </Text>
            </Box>
          </Group>
          <Group gap="xs" wrap="wrap" justify="flex-end">
            <Popover
              width={320}
              position="bottom-end"
              shadow="md"
              withArrow
            >
              <Popover.Target>
                <ActionIcon
                  variant={props.alertCount > 0 ? "filled" : "light"}
                  color={props.alertCount > 0 ? "red" : "gray"}
                  size="lg"
                  radius="xl"
                  title={`${props.alertCount} sync alert${props.alertCount === 1 ? "" : "s"}`}
                  aria-label={`${props.alertCount} sync alert${props.alertCount === 1 ? "" : "s"}`}
                >
                  <IconBell size={18} />
                  {props.alertCount > 0 && (
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
                        fontWeight: 700
                      }}
                    >
                      {props.alertCount > 99 ? "99+" : props.alertCount}
                    </Badge>
                  )}
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={600} size="sm">
                      Alerts
                    </Text>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={props.onRefreshAlerts}
                      loading={props.alertsLoading || props.alertsRefreshing}
                      title="Refresh"
                    >
                      <IconRefresh size={14} />
                    </ActionIcon>
                  </Group>
                  {props.alertItems.length === 0 && props.alertReadItems.length === 0 ? (
                    <Text c="dimmed" size="sm" ta="center" py="md">
                      No alerts right now
                    </Text>
                  ) : (
                    <>
                      {props.alertItems.length > 0 && (
                        <>
                          <Text size="xs" fw={500} c="dimmed">
                            Unread
                          </Text>
                          <ScrollArea.Autosize mah={180}>
                            <Stack gap="xs">
                              {props.alertItems.map((item) => (
                                <Box
                                  key={item.id}
                                  p="xs"
                                  style={{
                                    borderRadius: 6,
                                    backgroundColor: "#fef2f2",
                                    border: "1px solid #fecaca",
                                    cursor: "pointer"
                                  }}
                                  onClick={() => props.onNavigate("/sync-queue")}
                                >
                                  <Group gap="xs" justify="space-between">
                                    <Group gap={4}>
                                      <IconAlertTriangle size={14} color="#dc2626" />
                                      <Text size="xs" fw={500} tt="capitalize">
                                        {item.type}
                                      </Text>
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                      {new Date(item.timestamp).toLocaleDateString("id-ID")}
                                    </Text>
                                  </Group>
                                  <Text size="xs" c="dimmed" lineClamp={1} mt={4}>
                                    {item.error ?? "Sync failed"}
                                  </Text>
                                </Box>
                              ))}
                            </Stack>
                          </ScrollArea.Autosize>
                          <Button
                            variant="light"
                            color="red"
                            size="xs"
                            fullWidth
                            onClick={() => {
                              void props.onMarkAllAlertsRead().catch(() => undefined);
                            }}
                            loading={props.alertsRefreshing}
                          >
                            Mark all as read
                          </Button>
                        </>
                      )}
                      {props.alertReadItems.length > 0 && (
                        <>
                          <Text size="xs" fw={500} c="dimmed">
                            Recently read
                          </Text>
                          <ScrollArea.Autosize mah={180}>
                            <Stack gap="xs">
                              {props.alertReadItems.map((item) => (
                                <Box
                                  key={item.id}
                                  p="xs"
                                  style={{
                                    borderRadius: 6,
                                    backgroundColor: "#f9fafb",
                                    border: "1px solid #e5e7eb"
                                  }}
                                  onClick={() => props.onNavigate("/sync-queue")}
                                >
                                  <Group gap="xs" justify="space-between">
                                    <Group gap={4}>
                                      <Text size="xs" fw={500} tt="capitalize">
                                        {item.type}
                                      </Text>
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                      {new Date(item.readAt).toLocaleDateString("id-ID")}
                                    </Text>
                                  </Group>
                                  <Text size="xs" c="dimmed" lineClamp={1} mt={4}>
                                    {item.error ?? "Sync failed"}
                                  </Text>
                                </Box>
                              ))}
                            </Stack>
                          </ScrollArea.Autosize>
                        </>
                      )}
                    </>
                  )}
                  {props.alertCount > 0 && (
                    <Button
                      variant="light"
                      size="xs"
                      fullWidth
                      onClick={() => props.onNavigate("/sync-queue")}
                    >
                      View all ({props.alertCount})
                    </Button>
                  )}
                </Stack>
              </Popover.Dropdown>
            </Popover>
            <ConnectionStatusBadge />
            <Button component="a" href={posBaseUrl} target="_blank" rel="noopener noreferrer" size="sm">
              Open POS
            </Button>
            <Button variant="light" color="gray" size="sm" onClick={props.onSignOut}>
              Sign out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <ScrollArea type="auto" scrollbarSize={6} offsetScrollbars>
          <Stack gap="md">
            {NAV_GROUPS.map((group) => {
              const groupRoutes = props.routes.filter((route) => group.paths.includes(route.path));
              if (groupRoutes.length === 0) {
                return null;
              }
              return (
                <Box key={group.label}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.08em" }} mb={6}>
                    {group.label}
                  </Text>
                  <Stack gap={4}>
                    {groupRoutes.map((route) => (
                      <NavLink
                        key={route.path}
                        label={route.label}
                        active={route.path === props.activePath}
                        onClick={() => {
                          props.onNavigate(route.path);
                          close();
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="lg" px={0}>
          {props.children}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
