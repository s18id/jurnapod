// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useMemo, useState } from "react";
import {
  Stack,
  Group,
  Text,
  Checkbox,
  Button,
  ScrollArea,
  Divider,
  Box,
  UnstyledButton,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import type { ExportColumn } from "../hooks/use-export";

interface ColumnSelectorProps {
  columns: ExportColumn[];
  selectedColumns: string[];
  availableGroups: string[];
  getColumnsByGroup: (group: string) => ExportColumn[];
  onToggleColumn: (key: string) => void;
  onSelectAll: () => void;
  onSelectDefault: () => void;
  onSelectNone: () => void;
  compact?: boolean;
}

/**
 * Column selector component for export configuration.
 * Provides grouped columns with checkboxes and quick selection actions.
 */
export function ColumnSelector({
  columns,
  selectedColumns,
  availableGroups,
  getColumnsByGroup,
  onToggleColumn,
  onSelectAll,
  onSelectDefault,
  onSelectNone,
  compact = false,
}: ColumnSelectorProps) {
  // Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(availableGroups)
  );

  // Toggle group expansion
  const toggleGroup = useCallback((group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);

  // Check if all columns in a group are selected
  const isGroupFullySelected = useCallback(
    (group: string) => {
      const groupColumns = getColumnsByGroup(group);
      return groupColumns.every((col) => selectedColumns.includes(col.key));
    },
    [getColumnsByGroup, selectedColumns]
  );

  // Toggle all columns in a group
  const toggleGroupColumns = useCallback(
    (group: string) => {
      const groupColumns = getColumnsByGroup(group);
      const allSelected = isGroupFullySelected(group);
      groupColumns.forEach((col) => {
        if (allSelected) {
          // If all selected, deselect all
          if (selectedColumns.includes(col.key)) {
            onToggleColumn(col.key);
          }
        } else {
          // If not all selected, select all
          if (!selectedColumns.includes(col.key)) {
            onToggleColumn(col.key);
          }
        }
      });
    },
    [getColumnsByGroup, isGroupFullySelected, selectedColumns, onToggleColumn]
  );

  // Get column count summary
  const selectedCount = selectedColumns.length;
  const totalCount = columns.length;

  // Group stats
  const groupStats = useMemo(() => {
    return availableGroups.map((group) => {
      const groupColumns = getColumnsByGroup(group);
      const selectedInGroup = groupColumns.filter((col) =>
        selectedColumns.includes(col.key)
      ).length;
      return { group, selectedInGroup, totalInGroup: groupColumns.length };
    });
  }, [availableGroups, getColumnsByGroup, selectedColumns]);

  return (
    <Stack gap="sm">
      {/* Header with actions */}
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500}>
          Columns ({selectedCount}/{totalCount})
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Button
            variant="subtle"
            size="compact-xs"
            onClick={onSelectAll}
          >
            All
          </Button>
          <Button
            variant="subtle"
            size="compact-xs"
            onClick={onSelectDefault}
          >
            Default
          </Button>
          <Button
            variant="subtle"
            size="compact-xs"
            onClick={onSelectNone}
          >
            None
          </Button>
        </Group>
      </Group>

      <Divider />

      {/* Column groups */}
      <ScrollArea
        h={compact ? 200 : 300}
        type="auto"
        offsetScrollbars
      >
        <Stack gap="md">
          {groupStats.map(({ group, selectedInGroup, totalInGroup }) => {
            const isExpanded = expandedGroups.has(group);
            const isFullySelected = selectedInGroup === totalInGroup;
            const isPartiallySelected = selectedInGroup > 0 && selectedInGroup < totalInGroup;

            return (
              <Box key={group}>
                {/* Group header */}
                <UnstyledButton
                  onClick={() => toggleGroup(group)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    padding: "4px 0",
                    borderRadius: 4,
                  }}
                >
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                    {isExpanded ? (
                      <IconChevronDown size={14} />
                    ) : (
                      <IconChevronRight size={14} />
                    )}
                    <Checkbox
                      checked={isFullySelected}
                      indeterminate={isPartiallySelected}
                      onChange={() => toggleGroupColumns(group)}
                      size="sm"
                      label={
                        <Text size="sm" fw={500}>
                          {group}
                        </Text>
                      }
                      description={`${selectedInGroup}/${totalInGroup} selected`}
                    />
                  </Group>
                </UnstyledButton>

                {/* Group columns */}
                {isExpanded && (
                  <Stack gap="xs" pl="lg" mt="xs">
                    {getColumnsByGroup(group).map((column) => {
                      const isSelected = selectedColumns.includes(column.key);
                      return (
                        <Checkbox
                          key={column.key}
                          checked={isSelected}
                          onChange={() => onToggleColumn(column.key)}
                          size="sm"
                          label={
                            <Group gap="xs" wrap="nowrap">
                              <Text size="sm">{column.header}</Text>
                              {column.description && (
                                <Tooltip label={column.description} withArrow position="right">
                                  <Text size="xs" c="dimmed">
                                    ?
                                  </Text>
                                </Tooltip>
                              )}
                            </Group>
                          }
                          styles={{
                            body: {
                              alignItems: "center",
                            },
                          }}
                        />
                      );
                    })}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      </ScrollArea>

      {/* Footer summary */}
      {selectedCount === 0 && (
        <Text size="xs" c="orange" ta="center">
          No columns selected. Please select at least one column.
        </Text>
      )}
    </Stack>
  );
}
