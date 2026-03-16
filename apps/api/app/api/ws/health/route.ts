// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getWebSocketManager } from "@/lib/websocket";
import { successResponse, errorResponse } from "@/lib/response";

export const GET = async () => {
  try {
    const wsManager = getWebSocketManager();
    
    if (!wsManager) {
      return errorResponse("SERVICE_UNAVAILABLE", "WebSocket server not available", 503);
    }

    const stats = wsManager.getStats();
    const isActive = wsManager.isActive();

    return successResponse({
      websocket: {
        active: isActive,
        path: "/ws",
        protocol: "ws"
      },
      stats: {
        totalConnections: stats.total,
        authenticatedConnections: stats.authenticated,
        activeRooms: stats.rooms
      }
    });
  } catch (error) {
    console.error("WebSocket health check failed:", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Health check failed", 500);
  }
};
