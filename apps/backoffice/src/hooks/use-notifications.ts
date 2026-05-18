// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useNotificationContext } from "@/features/notifications/notification-provider";

export function useNotifications() {
  return useNotificationContext();
}
