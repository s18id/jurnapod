// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo } from "react";
import {
  Stack,
  Table,
  Select,
  Text,
  Group,
  Badge,
  Card,
  ScrollArea,
  Alert,
  Code,
  ThemeIcon,
} from "@mantine/core";
import { IconCheck, IconX, IconAlertCircle } from "@tabler/icons-react";

import type { ColumnMapping } from "../hooks/use-import";

interface ImportColumnMapperProps {
  columns: string[];
  sampleData: string[][];
  mappings: ColumnMapping[];
  onMappingChange: (index: number, targetField: string) => void;
  availableFields: Array<{ value: string; label: string; required?: boolean }>;
  maxSampleRows?: number;
}

export function ImportColumnMapper({
  columns,
  sampleData,
  mappings,
  onMappingChange,
  availableFields,
  maxSampleRows = 5,
}: ImportColumnMapperProps) {
  // Calculate auto-detection confidence
  const autoDetectedCount = useMemo(() => {
    return mappings.filter((m) => m.targetField !== "").length;
  }, [mappings]);

  const requiredFields = useMemo(() => {
    return availableFields.filter((f) => f.required).map((f) => f.value);
  }, [availableFields]);

  const mappedRequiredFields = useMemo(() => {
    const mappedFields = mappings
      .filter((m) => m.targetField !== "")
      .map((m) => m.targetField);
    return requiredFields.filter((rf) => mappedFields.includes(rf));
  }, [mappings, requiredFields]);

  const hasAllRequired = mappedRequiredFields.length === requiredFields.length;

  // Get sample values for a column
  const getSampleValues = (columnIndex: number): string[] => {
    return sampleData.slice(0, maxSampleRows).map((row) => row[columnIndex] ?? "");
  };

  return (
    <Stack gap="md">
      {/* Header Info */}
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={500} size="lg">
            Map Columns
          </Text>
          <Text size="sm" c="dimmed">
            Match your file columns to entity fields. Auto-detected mappings are highlighted.
          </Text>
        </div>
        <Group gap="xs">
          <Badge color="blue" variant="light">
            {autoDetectedCount} of {columns.length} auto-detected
          </Badge>
          {hasAllRequired ? (
            <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>
              Required fields mapped
            </Badge>
          ) : (
            <Badge color="orange" variant="light" leftSection={<IconAlertCircle size={12} />}>
              {requiredFields.length - mappedRequiredFields.length} required missing
            </Badge>
          )}
        </Group>
      </Group>

      {/* Required Fields Notice */}
      {!hasAllRequired && (
        <Alert color="orange" title="Required Fields">
          <Text size="sm">
            The following required fields must be mapped:{" "}
            {requiredFields
              .filter((rf) => !mappedRequiredFields.includes(rf))
              .map((rf) => {
                const fieldLabel = availableFields.find((f) => f.value === rf)?.label ?? rf;
                return fieldLabel;
              })
              .join(", ")}
          </Text>
        </Alert>
      )}

      {/* Mapping Table */}
      <Card withBorder>
        <ScrollArea>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 180 }}>File Column</Table.Th>
                <Table.Th style={{ minWidth: 120 }}>Sample Data</Table.Th>
                <Table.Th style={{ minWidth: 250 }}>Map to Field</Table.Th>
                <Table.Th style={{ width: 80 }}>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {columns.map((column, index) => {
                const mapping = mappings[index];
                const sampleValues = getSampleValues(index);
                const isAutoDetected = mapping?.targetField !== "";
                const isRequired =
                  mapping?.targetField &&
                  availableFields.find((f) => f.value === mapping.targetField)?.required;

                return (
                  <Table.Tr key={column}>
                    <Table.Td>
                      <Group gap="xs">
                        <Code>{column}</Code>
                        {isAutoDetected && (
                          <Badge size="xs" color="blue" variant="dot">
                            auto
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <ScrollArea.Autosize mah={60}>
                        <Stack gap={2}>
                          {sampleValues.slice(0, 3).map((val, i) => (
                            <Text key={i} size="xs" c="dimmed" lineClamp={1}>
                              {val || <em>(empty)</em>}
                            </Text>
                          ))}
                          {sampleValues.length > 3 && (
                            <Text size="xs" c="dimmed">
                              +{sampleValues.length - 3} more
                            </Text>
                          )}
                        </Stack>
                      </ScrollArea.Autosize>
                    </Table.Td>
                    <Table.Td>
                      <Select
                        placeholder="Select field..."
                        data={availableFields}
                        value={mapping?.targetField ?? ""}
                        onChange={(value) => onMappingChange(index, value ?? "")}
                        searchable
                        clearable={!isRequired}
                        error={isRequired && !mapping?.targetField ? "Required" : undefined}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Group justify="center">
                        {mapping?.targetField ? (
                          <ThemeIcon color="green" size="sm" variant="light">
                            <IconCheck size={14} />
                          </ThemeIcon>
                        ) : (
                          <ThemeIcon color="gray" size="sm" variant="light">
                            <IconX size={14} />
                          </ThemeIcon>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Tips */}
      <Card withBorder bg="gray.0">
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Tips
          </Text>
          <Text size="xs" c="dimmed">
            • Auto-detected mappings are based on common column name patterns. You can change
            any mapping.
          </Text>
          <Text size="xs" c="dimmed">
            • For items: SKU and Name are commonly required. For prices: Item SKU and Price.
          </Text>
          <Text size="xs" c="dimmed">
            • Sample data shows first 3 non-empty values from each column.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
