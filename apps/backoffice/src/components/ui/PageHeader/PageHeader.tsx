// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ReactNode } from "react";
import {
  Box,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";

/**
 * Breadcrumb item for navigation hierarchy
 */
export interface BreadcrumbItem {
  /** Display label for the breadcrumb */
  label: string;
  /** Optional URL for linking - if omitted, renders as plain text */
  href?: string;
  /** Whether this is the current/last page (no link needed) */
  current?: boolean;
}

/**
 * Validates if a URL is safe to use in href attribute.
 * Only allows http:, https:, and relative paths (starting with / or #).
 * @param href - The URL to validate
 * @returns true if the URL is safe, false otherwise
 */
export function isSafeHref(href: string | undefined): boolean {
  if (!href) return true; // undefined/empty is allowed (will be skipped)
  
  // Allow relative paths (starting with / or #)
  if (href.startsWith("/") || href.startsWith("#")) return true;
  
  // Allow http and https URLs only (case-insensitive)
  const lowerHref = href.toLowerCase();
  if (lowerHref.startsWith("http://") || lowerHref.startsWith("https://")) return true;
  
  // Block javascript: and other dangerous protocols
  return false;
}

/**
 * Get aria-current attribute value for a breadcrumb item.
 * This is the source of truth for aria-current logic.
 * @param item - Breadcrumb item
 * @param isLast - Whether this is the last item in the breadcrumb trail
 * @returns "page" if current, undefined otherwise
 */
export function getBreadcrumbAriaCurrent(item: BreadcrumbItem, isLast: boolean): string | undefined {
  if (isLast || item.current) return "page";
  return undefined;
}

/**
 * PageHeader Props
 *
 * Provides a consistent page header across all backoffice pages with:
 * - Title with optional subtitle
 * - Breadcrumb navigation
 * - Primary action buttons
 * - Loading skeleton states
 * - Responsive layout (mobile-first)
 * - WCAG 2.1 AA accessibility
 */
export interface PageHeaderProps {
  /**
   * Page title (required) - renders as h1 for proper heading hierarchy
   */
  title: string;
  /**
   * Optional subtitle/description text below the title
   */
  subtitle?: string;
  /**
   * Breadcrumb navigation items (optional)
   * - On mobile: hidden entirely
   * - On tablet+: shown above title
   */
  breadcrumbs?: BreadcrumbItem[];
  /**
   * Primary action buttons/controls (optional)
   * - On desktop/tablet: right-aligned next to title
   * - On mobile: stacked below title
   */
  actions?: ReactNode;
  /**
   * Loading state - renders skeleton placeholders instead of content
   * @default false
   */
  loading?: boolean;
  /**
   * Additional CSS class names
   */
  className?: string;
  /**
   * Test ID for testing
   */
  "data-testid"?: string;
}

/**
 * Truncate text with ellipsis if it exceeds max width
 * @param text - The text to truncate
 * @param maxChars - Maximum number of characters before truncation
 * @returns Truncated text with ellipsis if exceeded, otherwise original text
 *
 * @example
 * truncateText("Short title", 80) // "Short title"
 * truncateText("A".repeat(100), 80) // "aaaa...aaa..." (77 chars + "...")
 *
 * **Overflow Behavior Standards:**
 * - Titles exceeding 80 characters are truncated with ellipsis
 * - The full title is preserved in a `title` attribute for hover access
 * - Subtitle overflow follows the same pattern (ellipsis + title attribute)
 * - Action buttons are wrapped in a flex container that allows reflow
 * - Layout stability is maintained via Stack/Group gap properties
 * - Skeleton states match the dimensions of actual content
 */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + "...";
}

/**
 * Responsive layout constants
 * Based on Mantine v7 default breakpoints:
 * - xs: 0
 * - sm: 36em (576px) - mobile/tablet boundary
 * - md: 48em (768px)
 * - lg: 62em (992px)
 * - xl: 75em (1200px)
 */
const BREAKPOINT_SM = "sm"; // 36em (576px) - breadcrumbs visible from tablet+

/**
 * PageHeader Component
 *
 * Provides consistent page header structure across backoffice:
 * - Desktop: Title left, actions right, breadcrumbs above title
 * - Tablet: Title left, actions right (collapsed if needed)
 * - Mobile: Title stacked, actions below, breadcrumbs hidden
 *
 * Accessibility:
 * - Renders title as h1 for proper document outline
 * - Uses <header> landmark for header region
 * - Breadcrumb links have aria-current="page" on current item
 * - Breadcrumb separators are aria-hidden to prevent screen reader confusion
 * - All interactive elements have accessible names
 * - Focus states visible and meet WCAG 2.1 AA (2px outline, 2px offset)
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="User Management"
 *   subtitle="Manage user accounts and permissions"
 *   breadcrumbs={[
 *     { label: "Home", href: "/" },
 *     { label: "Settings", href: "/settings" },
 *     { label: "Users", current: true }
 *   ]}
 *   actions={<Button>Add User</Button>}
 * />
 * ```
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  loading = false,
  className,
  "data-testid": testId,
}: PageHeaderProps) {
  const theme = useMantineTheme();

  /**
   * Render breadcrumbs on tablet and above (hidden on mobile)
   * - Current page item has aria-current="page"
   * - Separator uses aria-hidden to prevent screen reader announcement
   * - Only safe URL protocols are allowed (http, https, relative paths)
   */
  const renderBreadcrumbs = (): ReactNode | null => {
    if (!breadcrumbs || breadcrumbs.length === 0) return null;

    return (
      <Group gap="xs" data-testid={testId ? `${testId}-breadcrumbs` : undefined}>
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const key = `breadcrumb-${index}`;
          const ariaCurrent = getBreadcrumbAriaCurrent(item, isLast);

          // Only render link if href is safe (prevents XSS) and item is not current page
          if (item.href && !isLast && !item.current && isSafeHref(item.href)) {
            // Link item - has safe href and is not current page
            return (
              <Group gap="xs" key={key}>
                <a
                  href={item.href}
                  className="page-header-breadcrumb-link"
                >
                  {item.label}
                </a>
                <Text c="dimmed" size="sm" aria-hidden="true">/</Text>
              </Group>
            );
          }

          // Current page item (or plain text without safe href)
          return (
            <Group gap="xs" key={key}>
              <Text
                c={isLast ? undefined : "dimmed"}
                size="sm"
                aria-current={ariaCurrent as "page" | undefined}
              >
                {item.label}
              </Text>
              {!isLast && (
                <Text c="dimmed" size="sm" aria-hidden="true">/</Text>
              )}
            </Group>
          );
        })}
      </Group>
    );
  };

  /**
   * Render skeleton loading state
   */
  const renderSkeleton = (): ReactNode => (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap="xs" style={{ flex: 1 }}>
          <Skeleton height={32} width="60%" />
          <Skeleton height={16} width="40%" />
        </Stack>
        <Group gap="sm">
          <Skeleton height={36} width={80} />
          <Skeleton height={36} width={80} />
        </Group>
      </Group>
    </Stack>
  );

  /**
   * Render title with truncation for overflow
   */
  const renderTitle = (): ReactNode => {
    const maxTitleChars = 80; // Reasonable max before truncation

    return (
      <Title
        order={1}
        size="h1"
        style={{
          fontSize: "1.75rem",
          fontWeight: 600,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={title.length > maxTitleChars ? title : undefined}
        data-testid={testId ? `${testId}-title` : undefined}
      >
        {title.length > maxTitleChars ? truncateText(title, maxTitleChars) : title}
      </Title>
    );
  };

  /**
   * Render subtitle if provided
   */
  const renderSubtitle = (): ReactNode | null => {
    if (!subtitle) return null;

    return (
      <Text
        c="dimmed"
        size="sm"
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={subtitle}
        data-testid={testId ? `${testId}-subtitle` : undefined}
      >
        {subtitle}
      </Text>
    );
  };

  /**
   * Render action buttons with overflow handling
   * Actions wrapped in a div with aria-label to provide accessible name
   * when actions contain buttons without explicit aria-labels
   */
  const renderActions = (): ReactNode | null => {
    if (!actions) return null;

    return (
      <div
        role="group"
        aria-label="Page actions"
        data-testid={testId ? `${testId}-actions` : undefined}
        style={{
          overflow: "hidden",
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        {actions}
      </div>
    );
  };

  if (loading) {
    return (
      <Box
        component="header"
        role="banner"
        className={className}
        data-testid={testId}
        px="md"
        py="sm"
        style={{
          borderBottom: `1px solid ${theme.colors.gray[2]}`,
        }}
      >
        {renderSkeleton()}
      </Box>
    );
  }

  return (
    <Box
      component="header"
      role="banner"
      className={className}
      data-testid={testId}
      px="md"
      py="sm"
      style={{
        borderBottom: `1px solid ${theme.colors.gray[2]}`,
      }}
    >
      {/* Breadcrumbs - hidden on mobile, visible on tablet+ - only render if breadcrumbs exist */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Box
          mb="sm"
          visibleFrom={BREAKPOINT_SM}
          data-testid={testId ? `${testId}-breadcrumb-container` : undefined}
        >
          {renderBreadcrumbs()}
        </Box>
      )}

      {/* Main header content */}
      <Group
        justify="space-between"
        align="flex-start"
        wrap="wrap"
        gap="md"
      >
        {/* Title and subtitle */}
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          {renderTitle()}
          {renderSubtitle()}
        </Stack>

        {/* Actions - right side on desktop/tablet, below on mobile - only render if actions exist */}
        {actions && (
          <>
            <Box
              w="100%"
              visibleFrom={BREAKPOINT_SM}
              style={{ flexShrink: 0 }}
            >
              {renderActions()}
            </Box>

            {/* Mobile-only actions (always visible on mobile) */}
            <Box
              hiddenFrom={BREAKPOINT_SM}
              w="100%"
              mt="xs"
            >
              {renderActions()}
            </Box>
          </>
        )}
      </Group>

      {/* Global styles for breadcrumb links - WCAG 2.1 AA compliant */}
      <style>{`
        .page-header-breadcrumb-link {
          color: var(--mantine-color-blue-6);
          text-decoration: none;
          font-size: 0.875rem;
        }
        .page-header-breadcrumb-link:focus {
          outline: 2px solid var(--mantine-color-blue-6);
          outline-offset: 2px;
          border-radius: 2px;
          text-decoration: underline;
        }
        .page-header-breadcrumb-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </Box>
  );
}

export default PageHeader;
