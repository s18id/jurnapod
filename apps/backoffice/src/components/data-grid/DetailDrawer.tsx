// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// DetailDrawer — Canonical shared admin primitive for detail views.
//
// Opens from table rows, renders typed detail content, and supports
// close/back/full-details actions.
//
// Usage:
//   import { DetailDrawer } from "@/components/data-grid";
//   <DetailDrawer opened={opened} onClose={close} title="Item Detail">
//     <ItemDetail item={selectedItem} />
//   </DetailDrawer>

import { Drawer, Group, Button, Text, Stack } from "@mantine/core";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DetailDrawerProps {
  /** Whether the drawer is open */
  opened: boolean;
  /** Called when the drawer closes */
  onClose: () => void;
  /** Drawer title */
  title: ReactNode;
  /** Detail content (the form or detail view inside the drawer) */
  children: ReactNode;
  /** Optional size preset or pixel width */
  size?: string | number;
  /** Position of the drawer */
  position?: "right" | "left" | "top" | "bottom";
  /** Optional action buttons rendered in the footer */
  actions?: ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: string | null;
  /** Test ID */
  "data-testid"?: string;
}

/**
 * DetailDrawer — A Mantine Drawer tailored for typed detail content.
 *
 * Opens from table rows to show full record details. Supports:
 *   - Close and back actions in the header/footer
 *   - Loading and error states in the body
 *   - Action buttons (save, void, etc.) in the footer
 */
export function DetailDrawer({
  opened,
  onClose,
  title,
  children,
  size = "md",
  position = "right",
  actions,
  loading = false,
  error = null,
  "data-testid": testId,
}: DetailDrawerProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        typeof title === "string" ? (
          <Text fw={600} size="lg">{title}</Text>
        ) : (
          title
        )
      }
      position={position}
      size={size}
      padding="lg"
      data-testid={testId ?? "detail-drawer"}
      closeButtonProps={{
        "aria-label": "Close detail drawer",
      }}
      styles={{
        header: {
          borderBottom: "1px solid var(--mantine-color-gray-2)",
        },
        body: {
          paddingTop: "var(--mantine-spacing-md)",
        },
      }}
    >
      <Stack gap="md">
        {/* Error state */}
        {error && (
          <Text c="red" size="sm" data-testid={testId ? `${testId}-error` : undefined}>
            {error}
          </Text>
        )}

        {/* Content */}
        {loading ? (
          <Text c="dimmed" size="sm" ta="center" py="xl">
            Loading...
          </Text>
        ) : (
          children
        )}
      </Stack>

      {/* Footer actions */}
      {actions && (
        <Group
          justify="flex-end"
          pt="md"
          mt="md"
          style={{
            borderTop: "1px solid var(--mantine-color-gray-2)",
          }}
          data-testid={testId ? `${testId}-actions` : undefined}
        >
          {actions}
        </Group>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Convenience: Full-details link helper
// ---------------------------------------------------------------------------

/**
 * Generate a "View full details" link prop for navigation.
 * Used alongside the drawer close button to offer a full-page view.
 */
export function fullDetailsLink(path: string, label?: string): ReactNode {
  return (
    <Button
      component="a"
      href={`#${path}`}
      variant="subtle"
      size="sm"
      data-testid="detail-drawer-full-details"
    >
      {label ?? "View full details"}
    </Button>
  );
}
