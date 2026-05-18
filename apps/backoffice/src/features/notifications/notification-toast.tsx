// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";

import type { BackofficeNotification, NotificationType } from "@/features/notifications/notification-types";

export const DEFAULT_TOAST_AUTO_CLOSE_MS = 5_000;

type ToastOptions = {
  title: string;
  message: string;
  color: string;
  autoClose: number;
  icon: JSX.Element;
};

export function getToastColor(type: NotificationType): string {
  if (type === "success") return "green";
  if (type === "warning") return "yellow";
  if (type === "error") return "red";
  return "blue";
}

export function buildToastOptions(
  notification: Pick<BackofficeNotification, "title" | "message" | "type">,
  autoCloseMs: number = DEFAULT_TOAST_AUTO_CLOSE_MS,
): ToastOptions {
  return {
    title: notification.title,
    message: notification.message,
    color: getToastColor(notification.type),
    autoClose: autoCloseMs,
    icon: getToastIcon(notification.type),
  };
}

function getToastIcon(type: NotificationType): JSX.Element {
  if (type === "success") return <IconCircleCheck size={16} />;
  if (type === "warning") return <IconAlertTriangle size={16} />;
  if (type === "error") return <IconX size={16} />;
  return <IconInfoCircle size={16} />;
}

export function showToastNotification(
  notification: Pick<BackofficeNotification, "title" | "message" | "type">,
  autoCloseMs: number = DEFAULT_TOAST_AUTO_CLOSE_MS,
): void {
  notifications.show(buildToastOptions(notification, autoCloseMs));
}
