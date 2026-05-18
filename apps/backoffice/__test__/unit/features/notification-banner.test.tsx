import { MantineProvider } from "@mantine/core";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NotificationBanner, NotificationBannerView } from "@/features/notifications/notification-banner";
import { NotificationProvider } from "@/features/notifications/notification-provider";
import type { BackofficeNotification } from "@/features/notifications/notification-types";

const banner: BackofficeNotification = {
  id: "polling.banner.backend-unreachable",
  title: "Backend unreachable",
  message: "Backend connection lost — retrying...",
  type: "error",
  timestamp: 1_800_000_000_000,
  read: false,
  layer: "banner",
  source: "polling",
};

function renderBanner(notifications: BackofficeNotification[]): string {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(
        NotificationProvider,
        { companyId: 10, userId: 20, pollingEnabled: false, initialNotifications: notifications },
        createElement(NotificationBanner),
      ),
    ),
  );
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

describe("NotificationBanner", () => {
  it("renders blocking backend unreachable copy", () => {
    const html = renderBanner([banner]);
    expect(html).toContain("Backend unreachable");
    expect(html).toContain("Backend connection lost — retrying...");
    expect(html).toContain("Acknowledge");
  });

  it("does not render when no active banner exists", () => {
    expect(renderBanner([])).not.toContain("notification-banner");
    expect(renderBanner([{ ...banner, read: true }])).not.toContain("Backend unreachable");
  });

  it("acknowledges the active banner through the action button", () => {
    const onAcknowledge = vi.fn();
    const view = NotificationBannerView({ activeBanner: banner, onAcknowledge }) as ReactElement;
    findElementByText(view, "Acknowledge").props.onClick();
    expect(onAcknowledge).toHaveBeenCalledWith("polling.banner.backend-unreachable");
  });
});
