// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Badge, Group, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconArrowUp, IconCash, IconReceipt, IconTable, IconUsers } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

import { getWebSocketClient, connectWebSocket, ConnectionStatus } from "../lib/websocket";

interface LiveMetricsData {
  totalSalesToday: number;
  transactionCountToday: number;
  activeOrdersCount: number;
  occupiedTablesCount: number;
  lastUpdated: Date;
}

type TransactionCreatedMessage = {
  totalAmount?: number | string;
  customerName?: string;
  outletName?: string;
};

interface LiveMetricsProps {
  companyId: number;
}

export function LiveMetrics({ companyId }: LiveMetricsProps) {
  const [metrics, setMetrics] = useState<LiveMetricsData | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [lastTransaction, setLastTransaction] = useState<TransactionCreatedMessage | null>(null);

  const fetchInitialMetrics = useCallback(async (cid: number) => {
    try {
      const response = await fetch(`/api/sync/backoffice/realtime?company_id=${cid}`);
      const data = await response.json();
      if (data.success && data.data) {
        const liveData = data.data.live_sales_metrics;
        setMetrics({
          totalSalesToday: Number(liveData?.total_sales_today || 0),
          transactionCountToday: liveData?.transaction_count_today || 0,
          activeOrdersCount: liveData?.active_orders_count || 0,
          occupiedTablesCount: liveData?.occupied_tables_count || 0,
          lastUpdated: new Date(),
        });
      }
    } catch (error) {
      console.error("Failed to fetch initial metrics:", error);
    }
  }, []);

  useEffect(() => {
    const client = getWebSocketClient();
    let statusTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let metricsTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

    const unsubscribeStatus = client.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    const unsubscribeTransaction = client.on("transaction:created", (message) => {
      if (message.data && message.data.totalAmount) {
        setLastTransaction(message.data);
        setMetrics((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            totalSalesToday: prev.totalSalesToday + Number(message.data.totalAmount),
            transactionCountToday: prev.transactionCountToday + 1,
            lastUpdated: new Date(),
          };
        });
      }
    });

    const unsubscribeExport = client.on("export:completed", (message) => {
      console.log("Export completed:", message);
    });

    // Connect if not already connected
    if (client.getStatus() === "disconnected") {
      connectWebSocket();
    } else {
      statusTimeoutId = globalThis.setTimeout(() => {
        setStatus(client.getStatus());
      }, 0);
    }

    // Fetch initial metrics
    metricsTimeoutId = globalThis.setTimeout(() => {
      void fetchInitialMetrics(companyId);
    }, 0);

    return () => {
      if (statusTimeoutId) {
        globalThis.clearTimeout(statusTimeoutId);
      }
      if (metricsTimeoutId) {
        globalThis.clearTimeout(metricsTimeoutId);
      }
      unsubscribeStatus();
      unsubscribeTransaction();
      unsubscribeExport();
    };
  }, [companyId, fetchInitialMetrics]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = () => {
    switch (status) {
      case "connected":
        return <Badge color="green" variant="light">Live</Badge>;
      case "connecting":
      case "reconnecting":
        return <Badge color="yellow" variant="light">Connecting...</Badge>;
      case "error":
        return <Badge color="red" variant="light">Error</Badge>;
      default:
        return <Badge color="gray" variant="light">Offline</Badge>;
    }
  };

  if (!metrics) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed">Loading live metrics...</Text>
      </Paper>
    );
  }

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="sm">Live Metrics</Text>
          {getStatusBadge()}
        </Group>

        <Group grow>
          <Paper p="xs" withBorder bg="gray.0">
            <Group gap="xs">
              <ThemeIcon size="sm" variant="light" color="green">
                <IconCash size={16} />
              </ThemeIcon>
              <div>
                <Text size="xs" c="dimmed">Today&apos;s Sales</Text>
                <Text fw={700} size="lg">{formatCurrency(metrics.totalSalesToday)}</Text>
              </div>
            </Group>
          </Paper>

          <Paper p="xs" withBorder bg="gray.0">
            <Group gap="xs">
              <ThemeIcon size="sm" variant="light" color="blue">
                <IconReceipt size={16} />
              </ThemeIcon>
              <div>
                <Text size="xs" c="dimmed">Transactions</Text>
                <Text fw={700} size="lg">{metrics.transactionCountToday}</Text>
              </div>
            </Group>
          </Paper>
        </Group>

        <Group grow>
          <Paper p="xs" withBorder bg="gray.0">
            <Group gap="xs">
              <ThemeIcon size="sm" variant="light" color="orange">
                <IconTable size={16} />
              </ThemeIcon>
              <div>
                <Text size="xs" c="dimmed">Occupied Tables</Text>
                <Text fw={700} size="lg">{metrics.occupiedTablesCount}</Text>
              </div>
            </Group>
          </Paper>

          <Paper p="xs" withBorder bg="gray.0">
            <Group gap="xs">
              <ThemeIcon size="sm" variant="light" color="violet">
                <IconUsers size={16} />
              </ThemeIcon>
              <div>
                <Text size="xs" c="dimmed">Active Orders</Text>
                <Text fw={700} size="lg">{metrics.activeOrdersCount}</Text>
              </div>
            </Group>
          </Paper>
        </Group>

        {lastTransaction && (
          <Paper p="xs" withBorder bg="green.0">
            <Group gap="xs">
              <IconArrowUp size={16} color="green" />
              <div>
                <Text size="xs" c="dimmed">Latest Transaction</Text>
                <Text size="sm" fw={500}>
                  {formatCurrency(Number(lastTransaction.totalAmount))} - {lastTransaction.outletName}
                </Text>
              </div>
            </Group>
          </Paper>
        )}

        <Text size="xs" c="dimmed" ta="right">
          Last updated: {metrics.lastUpdated.toLocaleTimeString()}
        </Text>
      </Stack>
    </Paper>
  );
}

export function LiveNotification() {
  const [notification, setNotification] = useState<any>(null);

  useEffect(() => {
    const client = getWebSocketClient();

    const unsubscribe = client.on("transaction:created", (message) => {
      setNotification({
        type: "success",
        message: `New transaction: ${message.data?.outletName} - ${Number(message.data?.totalAmount || 0).toLocaleString("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 })}`,
      });

      setTimeout(() => setNotification(null), 5000);
    });

    return () => unsubscribe();
  }, []);

  if (!notification) return null;

  return (
    <Paper
      p="md"
      withBorder
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 1000,
        maxWidth: 300,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      <Group gap="sm">
        <ThemeIcon color="green" variant="light">
          <IconCash size={20} />
        </ThemeIcon>
        <div>
          <Text size="sm" fw={500}>New Transaction</Text>
          <Text size="xs" c="dimmed">{notification.message}</Text>
        </div>
      </Group>
    </Paper>
  );
}
