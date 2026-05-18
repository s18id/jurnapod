// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import {
  getActiveBanner,
  getUnreadNotificationCount,
  initialNotificationState,
  notificationReducer,
  parseStoredNotifications,
  type NotificationState,
} from "@/features/notifications/notification-state";
import {
  makeNotificationStorageKey,
  sanitizeNotifications,
  type BackofficeNotification,
} from "@/features/notifications/notification-types";
import { showToastNotification } from "@/features/notifications/notification-toast";
import { useNotificationSource } from "@/hooks/use-notification-source";

export type NotificationContextValue = {
  state: NotificationState;
  notifications: BackofficeNotification[];
  unreadCount: number;
  activeBanner: BackofficeNotification | null;
  addNotification: (notification: BackofficeNotification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  deleteNotification: (id: string) => void;
  clearNotifications: () => void;
  acknowledgeBanner: (id: string) => void;
  clearBanner: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

type NotificationProviderProps = {
  companyId: number | null;
  userId: number | null;
  children: ReactNode;
  pollingEnabled?: boolean;
  initialNotifications?: BackofficeNotification[];
};

export function NotificationProvider({
  companyId,
  userId,
  children,
  pollingEnabled = true,
  initialNotifications = [],
}: NotificationProviderProps) {
  const [state, dispatch] = useReducer(notificationReducer, initialNotifications, (notifications) => ({
    ...initialNotificationState,
    notifications,
  }));
  const previousStorageKeyRef = useRef<string | null>(null);

  const storageKey = companyId && userId ? makeNotificationStorageKey(companyId, userId) : null;

  useEffect(() => {
    const previousStorageKey = previousStorageKeyRef.current;
    if (
      previousStorageKey &&
      previousStorageKey !== storageKey &&
      typeof window !== "undefined"
    ) {
      window.localStorage.removeItem(previousStorageKey);
    }
    previousStorageKeyRef.current = storageKey;

    if (!storageKey || typeof window === "undefined") {
      dispatch({ type: "clear" });
      return;
    }

    const stored = parseStoredNotifications(window.localStorage.getItem(storageKey));
    dispatch({ type: "hydrate", notifications: stored, storageKey });
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || state.storageKey !== storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(sanitizeNotifications(state.notifications)));
  }, [state.notifications, state.storageKey, storageKey]);

  const addNotification = useCallback((notification: BackofficeNotification) => {
    dispatch({ type: "add", notification });
    if (notification.layer === "toast") {
      showToastNotification(notification);
    }
  }, []);

  const clearBanner = useCallback((id: string) => {
    dispatch({ type: "clearBanner", id });
  }, []);

  const clearNotifications = useCallback(() => {
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
    dispatch({ type: "clear" });
  }, [storageKey]);

  const value = useMemo<NotificationContextValue>(() => ({
    state,
    notifications: state.notifications,
    unreadCount: getUnreadNotificationCount(state.notifications),
    activeBanner: getActiveBanner(state),
    addNotification,
    markRead: (id) => dispatch({ type: "markRead", id }),
    markAllRead: () => dispatch({ type: "markAllRead" }),
    deleteNotification: (id) => dispatch({ type: "delete", id }),
    clearNotifications,
    acknowledgeBanner: (id) => dispatch({ type: "bannerAcknowledge", id }),
    clearBanner,
  }), [state, addNotification, clearBanner, clearNotifications]);

  return (
    <NotificationContext.Provider value={value}>
      <NotificationSourceBridge
        enabled={pollingEnabled && !!companyId && !!userId}
        onNotification={addNotification}
        onClearBanner={clearBanner}
      />
      {children}
    </NotificationContext.Provider>
  );
}

function NotificationSourceBridge({
  enabled,
  onNotification,
  onClearBanner,
}: {
  enabled: boolean;
  onNotification: (notification: BackofficeNotification) => void;
  onClearBanner: (id: string) => void;
}) {
  useNotificationSource({ enabled, onNotification, onClearBanner });
  return null;
}

export function useNotificationContext(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotificationContext must be used within NotificationProvider");
  }
  return context;
}
