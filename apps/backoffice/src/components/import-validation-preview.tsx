// Copyright (c) 2026 Ahmad Faruk (SignalId ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useMemo, useCallback } from "react";
import {
  Stack,
  Group,
  Text,
  Badge,
  Button,
  Table,
  ScrollArea,
  Tabs,
  Card,
  Alert,
  Tooltip,
  ActionIcon,
  Modal,
  Loader,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconX,
  IconDownload,
  IconFileTypeCsv,
} from "@tabler/icons-react";

import type { ValidationResult, ValidationError } from "../hooks/use-import";

interface ImportValidationPreviewProps {
  validationResult: ValidationResult;
  sampleData?: string[][];
  columns?: string[];
  onCancel: () => void;
  onProceed: () => void;
  proceedLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

type TabValue = "all" | "valid" | "errors";

export function ImportValidationPreview({
  validationResult,
  sampleData = [],
  columns = [],
  onCancel,
  onProceed,
  proceedLabel = "Proceed with Import",
  cancelLabel = "Cancel",
  loading = false,
}: ImportValidationPreviewProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [selectedError, setSelectedError] = useState<ValidationError | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { totalRows, validRows, errorRows, errors, validRowIndices, errorRowIndices } = validationResult;

  const hasErrors = errorRows > 0;
  const canProceed = validRows > 0;

  // Get row data for display
  const getRowData = useCallback(
    (rowIndex: number): Record<string, string> => {
      if (sampleData.length > 0 && columns.length > 0) {
        const row = sampleData[rowIndex];
        const data: Record<string, string> = {};
        columns.forEach((col, idx) => {
          data[col] = row?.[idx] ?? "";
        });
        return data;
      }
      return { "Row": String(rowIndex + 1) };
    },
    [sampleData, columns]
  );

  // Get errors for a specific row
  const getRowErrors = useCallback(
    (rowIndex: number): ValidationError[] => {
      return errors.filter((e) => e.row === rowIndex);
    },
    [errors]
  );

  // Download error report
  const downloadErrorReport = useCallback(() => {
    const lines: string[] = [];
    lines.push(`Error Report - Generated ${new Date().toISOString()}`);
    lines.push(`Total Rows: ${totalRows}, Valid: ${validRows}, Errors: ${errorRows}`);
    lines.push("");
    lines.push("Error Details:");
    lines.push("");

    errors.forEach((err) => {
      lines.push(`Row ${err.row + 1}:`);
      lines.push(`  Column: ${err.column}`);
      lines.push(`  Value: ${err.value}`);
      lines.push(`  Error: ${err.message}`);
      lines.push("");
    });

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `import-errors-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [errors, totalRows, validRows, errorRows]);

  // Download CSV with error markers
  const downloadCsvWithErrors = useCallback(() => {
    if (sampleData.length === 0 || columns.length === 0) return;

    const lines: string[] = [];
    lines.push(columns.map((c) => `"${c}"`).join(",") + `,"_validation_status"`);

    sampleData.forEach((row, rowIndex) => {
      const rowErrors = getRowErrors(rowIndex);
      const status = rowErrors.length > 0 ? `ERROR: ${rowErrors.map((e) => e.message).join("; ")}` : "VALID";
      const escapedRow = row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`);
      lines.push(escapedRow.join(",") + `,"${status}"`);
    });

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `import-preview-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [sampleData, columns, getRowErrors]);

  // Filter data based on active tab
  const displayedRows = useMemo(() => {
    const maxDisplay = 100; // Limit for performance
    let indices: number[];

    switch (activeTab) {
      case "valid":
        indices = validRowIndices.slice(0, maxDisplay);
        break;
      case "errors":
        indices = errorRowIndices.slice(0, maxDisplay);
        break;
      default:
        indices = [...validRowIndices, ...errorRowIndices]
          .sort((a, b) => a - b)
          .slice(0, maxDisplay);
    }

    return indices.map((idx) => ({
      index: idx,
      data: getRowData(idx),
      errors: getRowErrors(idx),
      isValid: !getRowErrors(idx).length,
    }));
  }, [activeTab, validRowIndices, errorRowIndices, getRowData, getRowErrors]);

  return (
    <Stack gap="md">
      {/* Header Stats */}
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={500} size="lg">
            Validation Results
          </Text>
          <Text size="sm" c="dimmed">
            Review your data before importing
          </Text>
        </div>
        <Group gap="xs">
          <Badge size="lg" color="blue" variant="light">
            Total: {totalRows}
          </Badge>
          <Badge size="lg" color="green" variant="light" leftSection={<IconCheck size={14} />}>
            Valid: {validRows}
          </Badge>
          <Badge size="lg" color={hasErrors ? "red" : "gray"} variant="light" leftSection={hasErrors ? <IconX size={14} /> : null}>
            Errors: {errorRows}
          </Badge>
        </Group>
      </Group>

      {/* Summary Alert */}
      {hasErrors ? (
        <Alert color="orange" icon={<IconAlertCircle size={16} />} title="Validation Errors Found">
          <Text size="sm">
            {errorRows} row{errorRows !== 1 ? "s" : ""} have validation errors. You can proceed with the{" "}
            {validRows} valid row{validRows !== 1 ? "s" : ""} or fix the errors and re-upload.
          </Text>
        </Alert>
      ) : (
        <Alert color="green" icon={<IconCheck size={16} />} title="All Rows Valid">
          <Text size="sm">All {totalRows} rows passed validation. You can proceed with the import.</Text>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(v) => setActiveTab(v as TabValue)}>
        <Tabs.List>
          <Tabs.Tab value="all" leftSection={<IconFileTypeCsv size={14} />}>
            All Rows ({totalRows})
          </Tabs.Tab>
          <Tabs.Tab value="valid" leftSection={<IconCheck size={14} />} color="green">
            Valid ({validRows})
          </Tabs.Tab>
          <Tabs.Tab value="errors" leftSection={<IconX size={14} />} color="red">
            Errors ({errorRows})
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {/* Data Table */}
      <Card withBorder>
        <ScrollArea>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 60 }}>Row</Table.Th>
                {columns.map((col) => (
                  <Table.Th key={col}>{col}</Table.Th>
                ))}
                <Table.Th style={{ width: 120 }}>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {displayedRows.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={columns.length + 2}>
                    <Text c="dimmed" ta="center" py="md">
                      {activeTab === "valid"
                        ? "No valid rows to display"
                        : activeTab === "errors"
                        ? "No error rows to display"
                        : "No data to display"}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                displayedRows.map(({ index, data, errors: rowErrors, isValid }) => (
                  <Table.Tr key={index}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {index + 1}
                      </Text>
                    </Table.Td>
                    {columns.map((col) => (
                      <Table.Td key={col}>
                        <Text size="sm" lineClamp={1}>
                          {data[col] || <em className="text-dimmed">(empty)</em>}
                        </Text>
                      </Table.Td>
                    ))}
                    <Table.Td>
                      {isValid ? (
                        <Badge color="green" variant="light" size="sm">
                          Valid
                        </Badge>
                      ) : (
                        <Tooltip
                          label={
                            <Stack gap={4}>
                              {rowErrors.map((err, i) => (
                                <Text key={i} size="xs">
                                  <strong>{err.column}:</strong> {err.message}
                                </Text>
                              ))}
                            </Stack>
                          }
                          multiline
                          w={300}
                          position="left"
                        >
                          <Badge
                            color="red"
                            variant="light"
                            size="sm"
                            rightSection={
                              <ActionIcon
                                size="xs"
                                variant="transparent"
                                onClick={() => setSelectedError(rowErrors[0])}
                              >
                                <IconAlertCircle size={12} />
                              </ActionIcon>
                            }
                          >
                            {rowErrors.length} error{rowErrors.length !== 1 ? "s" : ""}
                          </Badge>
                        </Tooltip>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        {totalRows > 100 && (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            Showing first 100 rows. Download the full report for complete data.
          </Text>
        )}
      </Card>

      {/* Download Buttons */}
      <Group justify="space-between">
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconDownload size={16} />}
            onClick={downloadErrorReport}
            disabled={errors.length === 0}
          >
            Error Report
          </Button>
          <Button
            variant="subtle"
            leftSection={<IconFileTypeCsv size={16} />}
            onClick={downloadCsvWithErrors}
            disabled={sampleData.length === 0}
          >
            CSV with Status
          </Button>
        </Group>

        <Group>
          <Button variant="default" onClick={() => setShowCancelConfirm(true)}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onProceed}
            disabled={!canProceed || loading}
            leftSection={loading ? <Loader size={14} /> : null}
          >
            {proceedLabel} ({validRows} rows)
          </Button>
        </Group>
      </Group>

      {/* Cancel Confirmation Modal */}
      <Modal
        opened={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title="Cancel Import?"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to cancel this import? Your uploaded file and progress will be
            lost.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setShowCancelConfirm(false)}>
              Continue Import
            </Button>
            <Button color="red" onClick={onCancel}>
              Cancel Import
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Error Detail Modal */}
      {selectedError && (
        <Modal
          opened={!!selectedError}
          onClose={() => setSelectedError(null)}
          title={`Error in Row ${(selectedError?.row ?? 0) + 1}`}
          size="md"
        >
          <Stack gap="md">
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {selectedError.message}
            </Alert>
            <Card withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Column
                  </Text>
                  <Text size="sm" fw={500}>
                    {selectedError.column}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Value
                  </Text>
                  <Text size="sm" fw={500} style={{ wordBreak: "break-all" }}>
                    {selectedError.value || <em>(empty)</em>}
                  </Text>
                </Group>
              </Stack>
            </Card>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setSelectedError(null)}>
                Close
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </Stack>
  );
}
