// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// PermissionMatrix — a lightweight Mantine table/grid that renders
// canonical module.resource permission masks.
//
// - Readonly mode for system roles (backend-immutable).
// - Editable mode for custom roles with onChange callback.
// - This is a UX component only; it does NOT perform backend mutations.
// - Backend deny-by-default remains authoritative.

import { Badge, Table, Checkbox, Text, Group, Tooltip } from "@mantine/core";
import { useMemo, type FC } from "react";
import {
  PERMISSION_BITS,
  PERMISSION_MASKS,
  CANONICAL_MODULE_RESOURCES,
  isSystemRole,
  formatMaskLabel,
  type PermissionBit,
  type CanonicalModule,
} from "@/lib/auth/permissions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PermissionCell {
  module: CanonicalModule;
  resource: string;
  mask: number;
}

export interface PermissionMatrixProps {
  /** Role code to display (determines readonly vs editable) */
  roleCode: string;
  /** Current permission entries for the role */
  permissions: readonly PermissionCell[];
  /** Called when permissions change (only for custom/editable roles) */
  onChange?: (permissions: PermissionCell[]) => void;
  /** Whether to show the matrix as readonly (overrides isSystemRole check) */
  readOnly?: boolean;
  /** Maximum height for scroll (CSS value) */
  maxHeight?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PermissionMatrix renders all 8 canonical modules and their resources
 * as a permission grid. Each cell shows the current permission mask and
 * allows toggling individual permission bits (for editable roles).
 */
export const PermissionMatrix: FC<PermissionMatrixProps> = ({
  roleCode,
  permissions,
  onChange,
  readOnly: forceReadOnly,
  maxHeight = "60vh",
}) => {
  const readonly = forceReadOnly ?? isSystemRole(roleCode);
  const isSystem = isSystemRole(roleCode);

  // Build a lookup map: "module.resource" → mask
  const maskMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of permissions) {
      map.set(`${entry.module}.${entry.resource}`, entry.mask);
    }
    return map;
  }, [permissions]);

  // Flatten canonical modules into rows
  const rows = useMemo(() => {
    const result: { module: CanonicalModule; resource: string; mask: number }[] = [];
    for (const module of Object.keys(CANONICAL_MODULE_RESOURCES) as CanonicalModule[]) {
      const resources = CANONICAL_MODULE_RESOURCES[module];
      for (const resource of resources) {
        const key = `${module}.${resource}`;
        result.push({
          module,
          resource,
          mask: maskMap.get(key) ?? 0,
        });
      }
    }
    return result;
  }, [maskMap]);

  // Permission bit names in display order
  const bitNames: PermissionBit[] = ["READ", "CREATE", "UPDATE", "DELETE", "ANALYZE", "MANAGE"];

  // Handle toggling a bit for a specific cell
  const handleBitToggle = (module: CanonicalModule, resource: string, bitName: PermissionBit) => {
    if (readonly || !onChange) return;

    const bit = PERMISSION_BITS[bitName];
    const currentMask = maskMap.get(`${module}.${resource}`) ?? 0;
    const newMask = currentMask ^ bit; // toggle

    const newPermissions = permissions
      .filter((p) => !(p.module === module && p.resource === resource))
      .concat([{ module, resource, mask: newMask }])
      .filter((p) => p.mask !== 0); // remove entries with zero mask

    onChange(newPermissions);
  };

  // Handle setting a predefined mask
  const handleMaskSelect = (module: CanonicalModule, resource: string, mask: number) => {
    if (readonly || !onChange) return;

    const newPermissions = permissions
      .filter((p) => !(p.module === module && p.resource === resource))
      .concat(mask !== 0 ? [{ module, resource, mask }] : [])
      .filter((p) => p.mask !== 0);

    onChange(newPermissions);
  };

  return (
    <div style={{ maxHeight, overflowY: "auto" }}>
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ minWidth: 120 }}>Module</Table.Th>
            <Table.Th style={{ minWidth: 100 }}>Resource</Table.Th>
            <Table.Th style={{ minWidth: 80, textAlign: "center" }}>Mask</Table.Th>
            <Table.Th style={{ minWidth: 200, textAlign: "center" }}>Permissions</Table.Th>
            <Table.Th style={{ minWidth: 180, textAlign: "center" }}>Quick Select</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => {
            const key = `${row.module}.${row.resource}`;
            const mask = row.mask;
            const maskLabel = formatMaskLabel(mask);

            return (
              <Table.Tr key={key}>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {row.module}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{row.resource}</Text>
                </Table.Td>
                <Table.Td align="center">
                  <Badge
                    color={mask === 0 ? "gray" : mask <= 1 ? "blue" : mask <= 15 ? "teal" : mask <= 31 ? "violet" : "orange"}
                    variant="light"
                  >
                    {maskLabel} ({mask})
                  </Badge>
                </Table.Td>
                <Table.Td align="center">
                  <Group gap="xs" justify="center" wrap="nowrap">
                    {bitNames.map((bitName) => {
                      const bit = PERMISSION_BITS[bitName];
                      const isActive = (mask & bit) === bit;

                      return (
                        <Tooltip
                          key={bitName}
                          label={`${bitName} (${bit})`}
                          withArrow
                          disabled={readonly}
                        >
                          <Checkbox
                            size="xs"
                            checked={isActive}
                            disabled={readonly}
                            onChange={() => handleBitToggle(row.module, row.resource, bitName)}
                            aria-label={`${bitName} permission for ${row.module}.${row.resource}`}
                            styles={{
                              input: {
                                cursor: readonly ? "not-allowed" : "pointer",
                              },
                            }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Group>
                </Table.Td>
                <Table.Td align="center">
                  <Group gap={4} justify="center" wrap="nowrap">
                    {(["NONE", "READ", "WRITE", "CRUD", "CRUDA", "CRUDAM"] as const).map((label) => {
                      const presetMask = label === "NONE" ? 0 : PERMISSION_MASKS[label];
                      const isCurrent = mask === presetMask;
                      return (
                        <Badge
                          key={label}
                          size="xs"
                          variant={isCurrent ? "filled" : "outline"}
                          color={isCurrent ? "blue" : "gray"}
                          style={{
                            cursor: readonly ? "not-allowed" : "pointer",
                            opacity: readonly ? 0.6 : 1,
                          }}
                          onClick={() => {
                            if (!readonly && onChange) {
                              handleMaskSelect(row.module, row.resource, presetMask);
                            }
                          }}
                        >
                          {label}
                        </Badge>
                      );
                    })}
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      {isSystem && !forceReadOnly && (
        <Group justify="flex-end" mt="xs">
          <Badge color="yellow" variant="light" size="sm">
            System Role — read-only
          </Badge>
        </Group>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Named exports for convenience
// ---------------------------------------------------------------------------

export default PermissionMatrix;
