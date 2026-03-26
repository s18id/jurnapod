// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { OutletResponse, RoleResponse } from "@jurnapod/shared";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  Box
} from "@mantine/core";
import { useMemo, useState } from "react";

type OutletRoleMatrixProps = {
  title: string;
  outlets: OutletResponse[];
  roles: RoleResponse[];
  actorMaxRoleLevel: number;
  maxHeight: number;
  outletRoleCodesFor: (outletId: number) => string[];
  onUpdateRoleCode: (outletId: number, roleCode: string, checked: boolean) => void;
  onSetRoleForOutlets: (outletIds: number[], roleCode: string, checked: boolean) => void;
  onClearRolesForOutlets: (outletIds: number[]) => void;
};

type CellState = "none" | "checked" | "indeterminate";

interface RowSelection {
  [outletId: number]: boolean;
}

interface ColumnSelection {
  [roleCode: string]: boolean;
}

export function OutletRoleMatrix(props: OutletRoleMatrixProps) {
  const {
    title,
    outlets,
    roles,
    actorMaxRoleLevel,
    maxHeight,
    outletRoleCodesFor,
    onUpdateRoleCode,
    onSetRoleForOutlets,
    onClearRolesForOutlets
  } = props;

  const [searchValue, setSearchValue] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelection>({});
  const [columnSelection, setColumnSelection] = useState<ColumnSelection>({});

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredOutlets = useMemo(
    () =>
      outlets.filter((outlet) => {
        if (!normalizedSearch) {
          return true;
        }
        const haystack = `${outlet.name} ${outlet.code}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      }),
    [normalizedSearch, outlets]
  );

  const assignableRoles = useMemo(
    () => roles.filter((role) => role.role_level < actorMaxRoleLevel),
    [roles, actorMaxRoleLevel]
  );

  const filteredOutletIds = useMemo(() => filteredOutlets.map((outlet) => outlet.id), [filteredOutlets]);

  const totalSelectedRoleCount = useMemo(
    () =>
      outlets.reduce((count, outlet) => {
        const selected = outletRoleCodesFor(outlet.id);
        return count + selected.length;
      }, 0),
    [outletRoleCodesFor, outlets]
  );

  const selectedOutletCount = useMemo(
    () => outlets.filter((outlet) => outletRoleCodesFor(outlet.id).length > 0).length,
    [outletRoleCodesFor, outlets]
  );

  const selectedRowCount = useMemo(
    () => Object.values(rowSelection).filter(Boolean).length,
    [rowSelection]
  );

  const selectedColumnCount = useMemo(
    () => Object.values(columnSelection).filter(Boolean).length,
    [columnSelection]
  );

  const previewChanges = useMemo(() => {
    let additions = 0;
    let removals = 0;

    if (selectedRowCount > 0 && selectedColumnCount > 0) {
      const selectedOutletIdList = filteredOutlets
        .filter((outlet) => rowSelection[outlet.id])
        .map((outlet) => outlet.id);
      const selectedRoleCodeList = Object.keys(columnSelection).filter(
        (code) => columnSelection[code]
      );

      for (const outletId of selectedOutletIdList) {
        const currentRoles = new Set(outletRoleCodesFor(outletId));
        for (const roleCode of selectedRoleCodeList) {
          if (currentRoles.has(roleCode)) {
            removals++;
          } else {
            additions++;
          }
        }
      }
    }

    return { additions, removals };
  }, [rowSelection, columnSelection, filteredOutlets, outletRoleCodesFor, selectedRowCount, selectedColumnCount]);

  const hasSelectionInFilteredOutlets = useMemo(
    () => filteredOutlets.some((outlet) => outletRoleCodesFor(outlet.id).length > 0),
    [filteredOutlets, outletRoleCodesFor]
  );

  const allFilteredSelected = useMemo(
    () => filteredOutlets.length > 0 && filteredOutlets.every((outlet) => rowSelection[outlet.id]),
    [filteredOutlets, rowSelection]
  );

  const someFilteredSelected = useMemo(
    () => filteredOutlets.some((outlet) => rowSelection[outlet.id]) && !allFilteredSelected,
    [filteredOutlets, rowSelection, allFilteredSelected]
  );

  const toggleRowSelection = (outletId: number) => {
    setRowSelection((prev) => ({
      ...prev,
      [outletId]: !prev[outletId]
    }));
  };

  const toggleAllRowSelection = () => {
    if (allFilteredSelected) {
      setRowSelection({});
    } else {
      const newSelection: RowSelection = {};
      filteredOutlets.forEach((outlet) => {
        newSelection[outlet.id] = true;
      });
      setRowSelection(newSelection);
    }
  };

  const toggleColumnSelection = (roleCode: string) => {
    setColumnSelection((prev) => ({
      ...prev,
      [roleCode]: !prev[roleCode]
    }));
  };

  const toggleAllColumnSelection = () => {
    if (selectedColumnCount === assignableRoles.length) {
      setColumnSelection({});
    } else {
      const newSelection: ColumnSelection = {};
      assignableRoles.forEach((role) => {
        newSelection[role.code] = true;
      });
      setColumnSelection(newSelection);
    }
  };

  const applyBulkAdd = () => {
    if (selectedRowCount === 0 || selectedColumnCount === 0) return;

    const selectedOutletIdList = filteredOutlets
      .filter((outlet) => rowSelection[outlet.id])
      .map((outlet) => outlet.id);
    const selectedRoleCodeList = Object.keys(columnSelection).filter(
      (code) => columnSelection[code]
    );

    selectedRoleCodeList.forEach((roleCode) => {
      onSetRoleForOutlets(selectedOutletIdList, roleCode, true);
    });

    setRowSelection({});
    setColumnSelection({});
  };

  const applyBulkRemove = () => {
    if (selectedRowCount === 0 || selectedColumnCount === 0) return;

    const selectedOutletIdList = filteredOutlets
      .filter((outlet) => rowSelection[outlet.id])
      .map((outlet) => outlet.id);
    const selectedRoleCodeList = Object.keys(columnSelection).filter(
      (code) => columnSelection[code]
    );

    selectedRoleCodeList.forEach((roleCode) => {
      onSetRoleForOutlets(selectedOutletIdList, roleCode, false);
    });

    setRowSelection({});
    setColumnSelection({});
  };

  const getCellState = (outletId: number, roleCode: string): CellState => {
    const selectedRoles = outletRoleCodesFor(outletId);
    return selectedRoles.includes(roleCode) ? "checked" : "none";
  };

  const isRoleDisabled = (role: RoleResponse): boolean => {
    return role.role_level >= actorMaxRoleLevel;
  };

  const handleCellToggle = (outletId: number, roleCode: string, disabled: boolean) => {
    if (disabled) return;
    const currentState = getCellState(outletId, roleCode);
    onUpdateRoleCode(outletId, roleCode, currentState !== "checked");
  };

  return (
    <div>
      <Text fw={600} size="sm" mb={4}>
        {title}
      </Text>
      <Text size="xs" c="dimmed" mb="xs" role="status" aria-live="polite">
        {selectedOutletCount} outlets assigned, {totalSelectedRoleCount} role selections total.
      </Text>

      <Stack gap="xs" mb="sm">
        <TextInput
          label="Search outlets"
          placeholder="Search by outlet name or code"
          value={searchValue}
          onChange={(event) => setSearchValue(event.currentTarget.value)}
        />

        {(selectedRowCount > 0 || selectedColumnCount > 0) && (
          <Box
            p="sm"
            style={(theme) => ({
              backgroundColor: theme.colors.blue?.[0] ?? "#e7f5ff",
              borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.blue?.[2] ?? "#d0ebff"}`
            })}
          >
            <Group gap="xs" wrap="wrap">
              <Text size="xs" fw={500}>
                Bulk Preview:
              </Text>
              {previewChanges.additions > 0 && (
                <Badge color="green" variant="light" size="sm">
                  +{previewChanges.additions} assignments
                </Badge>
              )}
              {previewChanges.removals > 0 && (
                <Badge color="red" variant="light" size="sm">
                  -{previewChanges.removals} assignments
                </Badge>
              )}
              <Text size="xs" c="dimmed">
                ({selectedRowCount} outlets × {selectedColumnCount} roles)
              </Text>
            </Group>
            <Group gap="xs" mt="xs">
              <Button
                size="xs"
                color="green"
                variant="light"
                onClick={applyBulkAdd}
                disabled={previewChanges.additions === 0}
              >
                Add Roles
              </Button>
              <Button
                size="xs"
                color="red"
                variant="light"
                onClick={applyBulkRemove}
                disabled={previewChanges.removals === 0}
              >
                Remove Roles
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  setRowSelection({});
                  setColumnSelection({});
                }}
              >
                Clear Selection
              </Button>
            </Group>
          </Box>
        )}

        <Group gap="xs" wrap="wrap">
          <Button
            size="xs"
            variant="default"
            onClick={() => onClearRolesForOutlets(filteredOutletIds)}
            disabled={filteredOutletIds.length === 0 || !hasSelectionInFilteredOutlets}
          >
            Clear filtered outlets
          </Button>
          {assignableRoles.map((role) => (
            <Button
              key={`bulk-add-${role.code}`}
              size="xs"
              variant="light"
              onClick={() => onSetRoleForOutlets(filteredOutletIds, role.code, true)}
              disabled={filteredOutletIds.length === 0}
            >
              Add {role.name}
            </Button>
          ))}
        </Group>
      </Stack>

      <ScrollArea h={maxHeight} type="auto" offsetScrollbars>
        {outlets.length === 0 ? (
          <Text size="sm" c="dimmed">
            No outlets available.
          </Text>
        ) : roles.length === 0 ? (
          <Text size="sm" c="dimmed">
            No outlet-scoped roles available.
          </Text>
        ) : filteredOutlets.length === 0 ? (
          <Text size="sm" c="dimmed">
            No outlets match your search.
          </Text>
        ) : (
          <Table
            horizontalSpacing="xs"
            verticalSpacing="xs"
            withTableBorder
            withColumnBorders
            style={{
              minWidth: "100%"
            }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    backgroundColor: "white",
                    minWidth: 180
                  }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <Checkbox
                      checked={allFilteredSelected}
                      indeterminate={someFilteredSelected}
                      onChange={toggleAllRowSelection}
                      aria-label="Select all outlets"
                    />
                    <Text size="sm" fw={500}>
                      Outlet
                    </Text>
                  </Group>
                </Table.Th>
                <Table.Th
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 3,
                    backgroundColor: "white",
                    textAlign: "center",
                    minWidth: 100
                  }}
                >
                  <Checkbox
                    checked={selectedColumnCount === assignableRoles.length && assignableRoles.length > 0}
                    indeterminate={selectedColumnCount > 0 && selectedColumnCount < assignableRoles.length}
                    onChange={toggleAllColumnSelection}
                    aria-label="Select all roles"
                  />
                </Table.Th>
                {assignableRoles.map((role) => (
                  <Table.Th
                    key={role.code}
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 3,
                      backgroundColor: "white",
                      textAlign: "center",
                      minWidth: 120
                    }}
                  >
                    <Group gap="xs" wrap="nowrap" justify="center">
                      <Checkbox
                        checked={!!columnSelection[role.code]}
                        onChange={() => toggleColumnSelection(role.code)}
                        aria-label={`Select ${role.name} column`}
                      />
                      <div>
                        <Text size="sm" fw={500}>
                          {role.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {role.code}
                        </Text>
                      </div>
                    </Group>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredOutlets.map((outlet) => {
                const selectedRoleCodes = outletRoleCodesFor(outlet.id);
                const isRowSelected = !!rowSelection[outlet.id];

                return (
                  <Table.Tr
                    key={outlet.id}
                    style={
                      isRowSelected
                        ? {
                            backgroundColor: selectedColumnCount > 0 ? "#f0f9ff" : undefined
                          }
                        : undefined
                    }
                  >
                    <Table.Td
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        backgroundColor: isRowSelected ? "#f0f9ff" : "white",
                        minWidth: 180
                      }}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Checkbox
                          checked={isRowSelected}
                          onChange={() => toggleRowSelection(outlet.id)}
                          aria-label={`Select ${outlet.name}`}
                        />
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} truncate>
                            {outlet.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {outlet.code}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td
                      style={{
                        textAlign: "center",
                        minWidth: 100
                      }}
                    >
                      <Badge variant="light" color={selectedRoleCodes.length > 0 ? "teal" : "gray"}>
                        {selectedRoleCodes.length}
                      </Badge>
                    </Table.Td>
                    {assignableRoles.map((role) => {
                      const cellState = getCellState(outlet.id, role.code);
                      const disabled = isRoleDisabled(role);
                      const isColumnSelected = !!columnSelection[role.code];
                      const isCellHighlighted = isRowSelected && isColumnSelected;

                      return (
                        <Table.Td
                          key={role.code}
                          style={{
                            textAlign: "center",
                            backgroundColor: isCellHighlighted ? "#dbeafe" : undefined,
                            minWidth: 120
                          }}
                        >
                          <Tooltip
                            label={
                              disabled
                                ? `Requires higher privilege. ${role.code}`
                                : `${cellState === "checked" ? "Remove" : "Add"} ${role.name} for ${outlet.name}`
                            }
                            disabled={disabled}
                          >
                            <Checkbox
                              checked={cellState === "checked"}
                              disabled={disabled}
                              onChange={() => handleCellToggle(outlet.id, role.code, disabled)}
                              aria-label={`${role.name} for ${outlet.name}`}
                              color={isCellHighlighted ? "blue" : undefined}
                              variant={isCellHighlighted ? "filled" : undefined}
                            />
                          </Tooltip>
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </ScrollArea>
    </div>
  );
}
