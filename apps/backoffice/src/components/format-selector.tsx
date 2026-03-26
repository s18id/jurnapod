// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Stack, Text, Radio, Group, Card, Badge, ThemeIcon } from "@mantine/core";
import { IconFileSpreadsheet, IconFileTypeCsv } from "@tabler/icons-react";
import type { ExportFormat } from "../hooks/use-export";

interface FormatSelectorProps {
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  estimatedRows?: number;
}

/**
 * Format selector component for export configuration.
 * Provides radio buttons for CSV and Excel format selection.
 */
export function FormatSelector({
  format,
  onFormatChange,
  estimatedRows = 0,
}: FormatSelectorProps) {
  // Recommend format based on row count
  const recommendedFormat = estimatedRows > 1000 ? "xlsx" : "csv";

  const handleChange = (value: string) => {
    onFormatChange(value as ExportFormat);
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={500}>
        Export Format
      </Text>

      <Radio.Group value={format} onChange={handleChange}>
        <Stack gap="md">
          {/* CSV Option */}
          <Card
            withBorder
            padding="sm"
            style={{
              borderColor: format === "csv" ? "var(--mantine-color-blue-5)" : undefined,
              backgroundColor: format === "csv" ? "var(--mantine-color-blue-0)" : undefined,
              cursor: "pointer",
            }}
            onClick={() => onFormatChange("csv")}
          >
            <Group gap="sm" wrap="nowrap">
              <Radio value="csv" />
              <ThemeIcon variant="light" color="green" size="lg">
                <IconFileTypeCsv size={20} />
              </ThemeIcon>
              <Stack gap={2} style={{ flex: 1 }}>
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    CSV (Comma Separated Values)
                  </Text>
                  {recommendedFormat === "csv" && (
                    <Badge size="xs" color="green" variant="light">
                      Recommended
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  Universal format that works in any spreadsheet application.
                  Best for large datasets and automated processing.
                </Text>
              </Stack>
            </Group>
          </Card>

          {/* Excel Option */}
          <Card
            withBorder
            padding="sm"
            style={{
              borderColor: format === "xlsx" ? "var(--mantine-color-blue-5)" : undefined,
              backgroundColor: format === "xlsx" ? "var(--mantine-color-blue-0)" : undefined,
              cursor: "pointer",
            }}
            onClick={() => onFormatChange("xlsx")}
          >
            <Group gap="sm" wrap="nowrap">
              <Radio value="xlsx" />
              <ThemeIcon variant="light" color="blue" size="lg">
                <IconFileSpreadsheet size={20} />
              </ThemeIcon>
              <Stack gap={2} style={{ flex: 1 }}>
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    Excel (.xlsx)
                  </Text>
                  {recommendedFormat === "xlsx" && (
                    <Badge size="xs" color="green" variant="light">
                      Recommended
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  Microsoft Excel format with better formatting support.
                  Includes styled headers and multiple sheets for large data.
                </Text>
              </Stack>
            </Group>
          </Card>
        </Stack>
      </Radio.Group>

      {/* Format tips */}
      <Card withBorder padding="xs" bg="gray.0">
        <Stack gap={4}>
          <Text size="xs" fw={500}>
            Format Tips:
          </Text>
          <Text size="xs" c="dimmed">
            • CSV: Best for &gt;1,000 rows, imports easily into any system
          </Text>
          <Text size="xs" c="dimmed">
            • Excel: Better for reports, maintains formatting and data types
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
