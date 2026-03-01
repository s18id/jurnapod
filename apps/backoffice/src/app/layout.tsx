import type { ReactNode } from "react";
import {
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Container,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
  useMantineTheme
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { AppRoute } from "./routes";
import type { SessionUser } from "../lib/session";
import { useOnlineStatus } from "../lib/connection";

type AppLayoutProps = {
  user: SessionUser;
  routes: readonly AppRoute[];
  activePath: string;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
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
      "/chart-of-accounts",
      "/account-types",
      "/transactions",
      "/transaction-templates",
      "/account-mappings"
    ]
  },
  {
    label: "Sales",
    paths: ["/sales-invoices", "/sales-payments"]
  },
  {
    label: "POS",
    paths: ["/pos-transactions", "/pos-payments", "/sync-queue", "/sync-history", "/pwa-settings"]
  },
  {
    label: "Inventory",
    paths: ["/items-prices", "/supplies", "/fixed-assets", "/inventory-settings"]
  },
  {
    label: "Settings",
    paths: [
      "/outlet-settings",
      "/modules",
      "/tax-rates",
      "/users",
      "/roles",
      "/companies",
      "/outlets",
      "/static-pages"
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
