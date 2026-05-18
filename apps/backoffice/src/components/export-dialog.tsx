// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useMemo, useState } from "react";
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
  Collapse,
  ActionIcon,
  Paper,
  ScrollArea,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconDownload,
  IconX,
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCalendar,
  IconArrowUp,
  IconArrowDown,
  IconRefresh,
} from "@tabler/icons-react";
import { ColumnSelector } from "./column-selector";
import { FormatSelector } from "./format-selector";
import {
  buildExportScopeChips,
  clearExportScopeFilter,
  getExportDialogLayout,
  getLargeExportWarningMessage,
  getProgressDisplay,
  shouldShowLargeExportWarning,
} from "./export-dialog-helpers";
import { useExportDialog, type ExportEntityType, type ExportFilters } from "../hooks/use-export";

interface ExportDialogProps {
  opened: boolean;
  onClose: () => void;
  entityType: ExportEntityType;
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
  initialFilters = {},
  estimatedRowCount = 0,
}: ExportDialogProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  // Date range state for prices export
  const [showDateRange, setShowDateRange] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | null>(
    initialFilters.dateFrom ? new Date(initialFilters.dateFrom) : null
  );
  const [dateTo, setDateTo] = useState<Date | null>(
    initialFilters.dateTo ? new Date(initialFilters.dateTo) : null
  );
  // Column reordering mode
  const [reorderMode, setReorderMode] = useState(false);

  // Use the export dialog hook
  const {
    columns,
    availableGroups,
    selectedColumns,
    columnsLoading,
    columnsError,
    format,
    filters,
    toggleColumn,
    selectAll,
    selectDefault,
    selectNone,
    moveColumn,
    setFormat,
    setFilters,
    export: executeExport,
    loading,
    progress,
    error,
    retry,
  } = useExportDialog({
    entityType,
    
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
    // Include date range in filters for prices export
    // Use local date components to avoid timezone issues
    const formatDateLocal = (date: Date | null): string | undefined => {
      if (!date) return undefined;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const dateFromStr = formatDateLocal(dateFrom);
    const dateToStr = formatDateLocal(dateTo);
    
    // Update filters state for consistency (for next render)
    setFilters({
      ...filters,
      dateFrom: dateFromStr,
      dateTo: dateToStr,
    });
    
    // Execute export with override filters to ensure date range is included
    const result = await executeExport({
      dateFrom: dateFromStr,
      dateTo: dateToStr,
    });
    if (result.success) {
      onClose();
    }
  }, [executeExport, onClose, filters, dateFrom, dateTo, setFilters]);

  // Handle retry on error
  const handleRetry = useCallback(() => {
    void retry();
  }, [retry]);

  // Reset state when dialog opens with new entity type
  const handleClose = useCallback(() => {
    setFilters(initialFilters);
    setReorderMode(false);
    onClose();
  }, [onClose, initialFilters, setFilters]);

  const scopeChips = useMemo(() => buildExportScopeChips(entityType, filters), [entityType, filters]);

  const clearScopeFilter = useCallback((key: keyof ExportFilters) => {
    if (key === "dateFrom") setDateFrom(null);
    if (key === "dateTo") setDateTo(null);
    setFilters(clearExportScopeFilter(filters, key));
  }, [filters, setFilters]);

  const clearAllScopeFilters = useCallback(() => {
    setFilters({});
    setDateFrom(null);
    setDateTo(null);
  }, [setFilters]);

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

  const progressDisplay = useMemo(() => getProgressDisplay(progress), [progress]);
  const showLargeExportWarning = useMemo(
    () => shouldShowLargeExportWarning({ estimatedRowCount, progress }),
    [estimatedRowCount, progress]
  );
  const layout = useMemo(() => getExportDialogLayout(Boolean(isMobile)), [isMobile]);

  // Get selected column details for reordering
  const selectedColumnDetails = useMemo(() => {
    return selectedColumns.map(key => columns.find(col => col.key === key)).filter(Boolean);
  }, [selectedColumns, columns]);

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
      fullScreen={layout.fullScreen}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
    >
      <Stack gap="md">
        {/* Error alert with retry */}
        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            variant="light"
            title="Export Failed"
          >
            <Stack gap="xs">
              <Text size="sm">{error}</Text>
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconRefresh size={14} />}
                onClick={handleRetry}
              >
                Retry Export
              </Button>
            </Stack>
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
                {progressDisplay.label}
              </Text>
              <Progress
                value={progressDisplay.indeterminate ? 100 : progressDisplay.value ?? 0}
                animated={progressDisplay.indeterminate || progress?.phase !== "complete"}
                striped={progressDisplay.indeterminate}
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

        {/* Export info with row count */}
        <Paper p="sm" withBorder bg="gray.0">
          <Group justify="space-between" wrap="wrap">
            <Stack gap={4}>
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {selectedColumns.length} column{selectedColumns.length !== 1 ? "s" : ""} selected
                </Text>
                <Badge size="sm" color="blue" variant="light">
                  ~{estimatedRowCount.toLocaleString()} rows
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                Filename: {exportFilename}
              </Text>
            </Stack>
            <Badge color="blue" variant="light" size="lg">
              {format.toUpperCase()}
            </Badge>
          </Group>
          
          {estimatedRowCount > 50000 && format === "xlsx" && (
            <Alert icon={<IconAlertCircle size={14} />} color="yellow" variant="light" mt="xs">
              <Text size="xs">Large dataset detected. CSV format recommended for {estimatedRowCount.toLocaleString()} rows.</Text>
            </Alert>
          )}
          {estimatedRowCount === 0 && (
            <Alert icon={<IconAlertCircle size={14} />} color="yellow" variant="light" mt="xs">
              <Text size="xs">Current scope has 0 rows. Export may produce a header-only file.</Text>
            </Alert>
          )}
          {showLargeExportWarning && (
            <Alert icon={<IconAlertCircle size={14} />} color="orange" variant="light" mt="xs">
              <Text size="xs">{getLargeExportWarningMessage(estimatedRowCount)}</Text>
            </Alert>
          )}
        </Paper>

        <Divider />

        {/* Inherited scope */}
        <Paper p="sm" withBorder>
          <Group justify="space-between" align="flex-start" gap="xs">
            <Stack gap={4} style={{ flex: 1 }}>
              <Text size="sm" fw={500}>Inherited Scope</Text>
              {scopeChips.length > 0 ? (
                <Group gap="xs">
                  {scopeChips.map((chip) => (
                    <Badge
                      key={`${chip.key}-${chip.value}`}
                      variant="light"
                      rightSection={
                        <ActionIcon
                          size="xs"
                          variant="transparent"
                          aria-label={`Clear ${chip.label} filter`}
                          onClick={() => clearScopeFilter(chip.key)}
                        >
                          <IconX size={10} />
                        </ActionIcon>
                      }
                    >
                      {chip.label}: {chip.value}
                    </Badge>
                  ))}
                </Group>
              ) : (
                <Text size="xs" c="dimmed">No filters inherited; export includes the current entity scope.</Text>
              )}
            </Stack>
            {scopeChips.length > 0 && (
              <Button size="compact-xs" variant="subtle" onClick={clearAllScopeFilters}>
                Clear scope
              </Button>
            )}
          </Group>
        </Paper>

        <Divider />

        {/* Two-column layout */}
        <Group align="flex-start" wrap={layout.contentWrap} gap="lg">
          {/* Left: Column selector or reorderer */}
          <Stack gap="md" style={{ flex: 1, minWidth: 200 }}>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                {reorderMode ? "Column Order" : "Columns"}
              </Text>
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() => setReorderMode(!reorderMode)}
              >
                {reorderMode ? "Done" : "Reorder"}
              </Button>
            </Group>

            {columnsLoading ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Loading export columns...</Text>
              </Group>
            ) : columnsError ? (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {columnsError}
              </Alert>
            ) : reorderMode ? (
              /* Column reordering view */
              <ScrollArea h={300} type="auto">
                <Stack gap="xs">
                  {selectedColumnDetails.map((col, index) => (
                    <Paper key={col!.key} p="xs" withBorder>
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="sm" truncate style={{ flex: 1 }}>
                          {col!.header}
                        </Text>
                        <Group gap={4} wrap="nowrap">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            disabled={index === 0}
                            onClick={() => moveColumn(col!.key, "up")}
                          >
                            <IconArrowUp size={14} />
                          </ActionIcon>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            disabled={index === selectedColumnDetails.length - 1}
                            onClick={() => moveColumn(col!.key, "down")}
                          >
                            <IconArrowDown size={14} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    </Paper>
                  ))}
                  {selectedColumnDetails.length === 0 && (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                      Select at least one column before reordering.
                  </Text>
                  )}
                </Stack>
              </ScrollArea>
            ) : (
              /* Column selector view */
              <ColumnSelector
                columns={columns}
                selectedColumns={selectedColumns}
                availableGroups={availableGroups}
                getColumnsByGroup={getColumnsByGroup}
                onToggleColumn={toggleColumn}
                onSelectAll={selectAll}
                onSelectDefault={selectDefault}
                onSelectNone={selectNone}
                compact={isMobile}
              />
            )}
          </Stack>

          {/* Divider */}
          <Divider orientation={layout.dividerOrientation} />

          {/* Right: Format selector */}
          <Stack gap="md" style={{ flex: 1, minWidth: 200 }}>
            <FormatSelector
              format={format}
              onFormatChange={setFormat}
              estimatedRows={estimatedRowCount}
            />
            
            {/* Date range filter for prices */}
            {entityType === "prices" && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>
                    Date Range
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => setShowDateRange(!showDateRange)}
                    aria-label={showDateRange ? "Hide date range" : "Show date range"}
                  >
                    {showDateRange ? (
                      <IconChevronUp size={16} />
                    ) : (
                      <IconChevronDown size={16} />
                    )}
                  </ActionIcon>
                </Group>
                <Collapse in={showDateRange}>
                  <Stack gap="xs">
                    <DatePickerInput
                      leftSection={<IconCalendar size={16} />}
                      label="From"
                      placeholder="Start date"
                      value={dateFrom}
                      onChange={setDateFrom}
                      clearable
                      size="sm"
                    />
                    <DatePickerInput
                      leftSection={<IconCalendar size={16} />}
                      label="To"
                      placeholder="End date"
                      value={dateTo}
                      onChange={setDateTo}
                      clearable
                      size="sm"
                    />
                    <Text size="xs" c="dimmed">
                      Filter prices by last updated date
                    </Text>
                  </Stack>
                </Collapse>
              </Stack>
            )}
          </Stack>
        </Group>

        <Divider />

        {/* Actions */}
        <Group justify="flex-end" grow={layout.actionsGrow}>
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
            fullWidth={isMobile}
            disabled={selectedColumns.length === 0 || columnsLoading || Boolean(columnsError)}
          >
            Export {selectedColumns.length} Column{selectedColumns.length !== 1 ? "s" : ""}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
