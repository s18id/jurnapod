// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Box, Card, Group, Text } from "@mantine/core";

import type { ReceivablesAgeingReport } from "../../../types/reports/receivables-ageing";
import { formatMoney } from "../../../hooks/use-receivables-ageing";

interface AgeingSummaryCardsProps {
  data: ReceivablesAgeingReport | null;
  isLoading?: boolean;
}

type StatTileTone = "default" | "positive" | "warning" | "negative";

const toneColorMap: Record<StatTileTone, string> = {
  default: "inherit",
  positive: "var(--mantine-color-green-7)",
  warning: "var(--mantine-color-orange-7)",
  negative: "var(--mantine-color-red-7)",
};

interface SummaryCardProps {
  title: string;
  value: string | number;
  tone?: StatTileTone;
  helper?: string;
}

function SummaryCard({ title, value, tone = "default", helper }: SummaryCardProps) {
  return (
    <Card padding="sm" style={{ border: "1px solid #e2ddd2" }}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: "0.08em" }}>
        {title}
      </Text>
      <Text size="lg" fw={600} style={{ color: toneColorMap[tone] }}>
        {value}
      </Text>
      {helper ? (
        <Text size="xs" c="dimmed">
          {helper}
        </Text>
      ) : null}
    </Card>
  );
}

export function AgeingSummaryCards({ data, isLoading }: AgeingSummaryCardsProps) {
  if (isLoading) {
    return (
      <Group gap="sm" style={{ width: "100%" }}>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} padding="sm" style={{ flex: 1, border: "1px solid #e2ddd2", opacity: 0.5 }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: "0.08em" }}>
              Loading...
            </Text>
            <Box style={{ height: 24, backgroundColor: "#f0f0f0", borderRadius: 4, marginTop: 4 }} />
          </Card>
        ))}
      </Group>
    );
  }

  if (!data) {
    return null;
  }

  // Calculate overdue from buckets (API may not provide overdue_total/percentage)
  const totalOutstanding = data.total_outstanding;
  const currentAmount = data.buckets.current;
  const overdueTotal = data.buckets["1_30_days"] + data.buckets["31_60_days"] + data.buckets["61_90_days"] + data.buckets.over_90_days;
  const overduePercentage = totalOutstanding > 0 ? (overdueTotal / totalOutstanding) * 100 : 0;

  // Determine tone based on overdue percentage
  const overdueTone: StatTileTone = overduePercentage > 30 ? "negative" : overduePercentage > 0 ? "warning" : "default";

  return (
    <Group gap="sm" style={{ width: "100%" }}>
      <SummaryCard
        title="Total Outstanding"
        value={formatMoney(totalOutstanding)}
        tone="default"
      />
      <SummaryCard
        title="Current"
        value={formatMoney(currentAmount)}
        tone="positive"
        helper="Not yet due"
      />
      <SummaryCard
        title="Overdue"
        value={formatMoney(overdueTotal)}
        tone={overdueTone}
        helper={
          overduePercentage > 0
            ? `${overduePercentage.toFixed(1)}% of total`
            : undefined
        }
      />
      <SummaryCard
        title="% Overdue"
        value={`${overduePercentage.toFixed(1)}%`}
        tone={overduePercentage > 30 ? "negative" : overduePercentage > 0 ? "warning" : "default"}
        helper="Of total outstanding"
      />
    </Group>
  );
}