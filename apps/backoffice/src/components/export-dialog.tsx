// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useMemo } from "react";
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  Progress,
  Alert,
  Loader,
  Divider,
  Badge,
  ThemeIcon,
} from "@mantine/core";
import {
  IconDownload,
  IconX,
  IconAlertCircle,
  IconCheck,
} from "@tabler/icons-react";
import { ColumnSelector } from "./column-selector";
import { FormatSelector } from "./format-selector";
import { useExportDialog, type ExportEntityType, type ExportFilters } from "../hooks/use-export";

interface ExportDialogProps {
  opened: boolean;
  onClose: () => void;
  entityType: ExportEntityType;
  accessToken: string;
  initialFilters?: ExportFilters;
  estimatedRowCount?: number;
}

/**
 * Main export dialog component.
 * Provides a modal interface for configuring and executing exports.
 */
export function ExportDialog({
  opened,
  onClose,
  entityType,
  accessToken,
  initialFilters = {},
  estimatedRowCount = 0,
}: ExportDialogProps) {
  // Use the export dialog hook
  const {
    columns,
    availableGroups,
    selectedColumns,
    format,
    filters,
    toggleColumn,
    selectAll,
    selectDefault,
    selectNone,
    setFormat,
    setFilters,
    export: executeExport,
    loading,
    progress,
    error,
  } = useExportDialog({
    entityType,
    accessToken,
    initialFilters,
  });

  // Get columns by group helper
  const getColumnsByGroup = useCallback(
    (group: string) => {
      return columns.filter((col) => col.group === group);
    },
    [columns]
  );

  // Handle export execution
  const handleExport = useCallback(async () => {
    const result = await executeExport();
    if (result.success) {
      onClose();
    }
  }, [executeExport, onClose]);

  // Reset state when dialog opens with new entity type
  const handleClose = useCallback(() => {
    setFilters(initialFilters);
    onClose();
  }, [onClose, initialFilters, setFilters]);

  // Calculate export info
  const exportFilename = useMemo(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const entityPart = entityType;
    const formatExt = format === "xlsx" ? "xlsx" : "csv";
    
    if (entityType === "prices" && filters.outletId) {
      return `jurnapod-${entityPart}-outlet-${filters.outletId}-${timestamp}.${formatExt}`;
    }
    return `jurnapod-${entityPart}-${timestamp}.${formatExt}`;
  }, [entityType, format, filters.outletId]);

  // Progress percentage for streaming
  const progressPercent = useMemo(() => {
    if (!progress || progress.phase === "preparing") return 0;
    if (progress.phase === "complete") return 100;
    if (progress.phase === "error") return 0;
    // For streaming, we don't have total bytes info in this simplified version
    return 50; // Indeterminate progress
  }, [progress]);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <ThemeIcon variant="light" color="blue" size="md">
            <IconDownload size={16} />
          </ThemeIcon>
          <Text fw={600}>
            Export {entityType === "items" ? "Items" : "Prices"}
          </Text>
        </Group>
      }
      size="lg"
      centered
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
    >
      <Stack gap="md">
        {/* Error alert */}
        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            variant="light"
            withCloseButton
            onClose={() => {}}
          >
            {error}
          </Alert>
        )}

        {/* Loading state */}
        {loading && (
          <Alert
            icon={<Loader size={16} />}
            color="blue"
            variant="light"
          >
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Exporting...
              </Text>
              <Text size="xs" c="dimmed">
                {progress?.phase === "preparing" && "Preparing export..."}
                {progress?.phase === "streaming" && "Downloading export file..."}
              </Text>
              <Progress
                value={progressPercent}
                animated={progress?.phase !== "complete"}
                size="sm"
                radius="xl"
              />
            </Stack>
          </Alert>
        )}

        {/* Success state */}
        {progress?.phase === "complete" && !loading && (
          <Alert
            icon={<IconCheck size={16} />}
            color="green"
            variant="light"
          >
            Export completed successfully!
          </Alert>
        )}

        {/* Export info */}
        <Group justify="space-between" wrap="wrap">
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {selectedColumns.length} column{selectedColumns.length !== 1 ? "s" : ""} selected
            </Text>
            <Text size="xs" c="dimmed">
              Filename: {exportFilename}
            </Text>
          </Stack>
          <Badge color="blue" variant="light" size="lg">
            {format.toUpperCase()}
          </Badge>
        </Group>

        <Divider />

        {/* Two-column layout */}
        <Group align="flex-start" wrap="nowrap" gap="lg">
          {/* Left: Column selector */}
          <Stack gap="md" style={{ flex: 1, minWidth: 200 }}>
            <ColumnSelector
              columns={columns}
              selectedColumns={selectedColumns}
              availableGroups={availableGroups}
              getColumnsByGroup={getColumnsByGroup}
              onToggleColumn={toggleColumn}
              onSelectAll={selectAll}
              onSelectDefault={selectDefault}
              onSelectNone={selectNone}
            />
          </Stack>

          {/* Divider */}
          <Divider orientation="vertical" />

          {/* Right: Format selector */}
          <Stack gap="md" style={{ flex: 1, minWidth: 200 }}>
            <FormatSelector
              format={format}
              onFormatChange={setFormat}
              estimatedRows={estimatedRowCount}
            />
          </Stack>
        </Group>

        <Divider />

        {/* Actions */}
        <Group justify="flex-end">
          <Button
            variant="default"
            leftSection={<IconX size={16} />}
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={handleExport}
            loading={loading}
            disabled={selectedColumns.length === 0}
          >
            Export {selectedColumns.length} Column{selectedColumns.length !== 1 ? "s" : ""}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
