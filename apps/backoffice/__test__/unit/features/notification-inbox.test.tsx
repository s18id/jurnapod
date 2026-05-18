import { MantineProvider } from "@mantine/core";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NotificationInbox,
  NotificationInboxPanel,
  openNotificationTarget,
  resolveNotificationOpenTarget,
} from "@/features/notifications/notification-inbox";
import { NotificationProvider } from "@/features/notifications/notification-provider";
import type { BackofficeNotification } from "@/features/notifications/notification-types";
import { AsyncJobDrawerProvider } from "@/hooks/use-async-job-drawer";

function makeNotification(overrides: Partial<BackofficeNotification> = {}): BackofficeNotification {
  return {
    id: "inbox-1",
    title: "Import completed",
    message: "Operation op-68-3 completed.",
    type: "success",
    timestamp: 1_800_000_000_000,
    read: false,
    layer: "inbox",
    source: "polling",
    deepLink: { path: "/operations", params: { operationId: "op-68-3" } },
    ...overrides,
  };
}

function renderInbox(notifications: BackofficeNotification[]): string {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(
        AsyncJobDrawerProvider,
        {},
        createElement(
          NotificationProvider,
          { companyId: 10, userId: 20, pollingEnabled: false, initialNotifications: notifications },
          createElement(NotificationInbox, { defaultOpened: true }),
        ),
      ),
    ),
  );
}

function renderPanel(notifications: BackofficeNotification[]): string {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(NotificationInboxPanel, {
        notifications,
        unreadCount: notifications.filter((notification) => !notification.read).length,
        onOpen: () => undefined,
        onMarkAllRead: () => undefined,
        onDelete: () => undefined,
      }),
    ),
  );
}

function findElementByProp(node: ReactNode, propName: string, propValue: unknown): ReactElement {
  if (isValidElement(node) && node.props[propName] === propValue) return node;
  if (isValidElement(node)) {
    for (const child of Children.toArray(node.props.children)) {
      try {
        return findElementByProp(child, propName, propValue);
      } catch {
        // Continue walking siblings.
      }
    }
  }
  throw new Error(`Element with ${propName}=${String(propValue)} not found`);
}

function findElementByText(node: ReactNode, text: string): ReactElement {
  if (isValidElement(node)) {
    const children = Children.toArray(node.props.children);
    if (children.some((child) => child === text)) return node;
    for (const child of children) {
      try {
        return findElementByText(child, text);
      } catch {
        // Continue walking siblings.
      }
    }
  }
  throw new Error(`Element with text ${text} not found`);
}

function renderPanelElement(props: Partial<Parameters<typeof NotificationInboxPanel>[0]> = {}): ReactElement {
  return NotificationInboxPanel({
    notifications: [makeNotification()],
    unreadCount: 1,
    onOpen: () => undefined,
    onMarkAllRead: () => undefined,
    onDelete: () => undefined,
    ...props,
  }) as ReactElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NotificationInbox", () => {
  it("renders bell badge, unread marker, and notification list", () => {
    const html = renderInbox([makeNotification()]);
    expect(html).toContain("notification-inbox-button");
    expect(html).toContain("notification-unread-badge");

    const panelHtml = renderPanel([makeNotification()]);
    expect(panelHtml).toContain("Import completed");
    expect(panelHtml).toContain("Operation op-68-3 completed.");
    expect(panelHtml).toContain("Unread");
  });

  it("hides unread badge when notifications are read", () => {
    const html = renderInbox([makeNotification({ read: true })]);
    expect(html).not.toContain("notification-unread-badge");
    expect(renderPanel([makeNotification({ read: true })])).toContain("Import completed");
  });

  it("renders an empty state", () => {
    const html = renderPanel([]);
    expect(html).toContain("No notifications");
  });

  it("invokes open, mark-all-read, and delete handlers from the inbox panel", () => {
    const onOpen = vi.fn();
    const onMarkAllRead = vi.fn();
    const onDelete = vi.fn();
    const panel = renderPanelElement({ onOpen, onMarkAllRead, onDelete });

    findElementByProp(panel, "data-testid", "notification-item-inbox-1").props.onClick();
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "inbox-1" }));

    findElementByText(panel, "Mark all read").props.onClick();
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);

    const stopPropagation = vi.fn();
    findElementByProp(panel, "aria-label", "Delete Import completed").props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("inbox-1");
  });

  it("resolves and opens operation deep-links through the AsyncJobDrawer target", () => {
    const notification = makeNotification({
      deepLink: { path: "/operations", params: { operationId: "op-68-3", operationType: "import" } },
    });
    const drawer = { open: vi.fn() };
    Object.defineProperty(globalThis, "location", { value: { hash: "" }, configurable: true });

    expect(resolveNotificationOpenTarget(notification)).toEqual({
      hash: "#/operations?operationId=op-68-3&operationType=import",
      operationId: "op-68-3",
      operationType: "import",
    });

    expect(openNotificationTarget(notification, drawer)).toEqual(expect.objectContaining({ operationId: "op-68-3" }));
    expect(drawer.open).toHaveBeenCalledWith({ operationId: "op-68-3", operationType: "import" });
    expect(globalThis.location.hash).toBe("#/operations?operationId=op-68-3&operationType=import");
  });
});
