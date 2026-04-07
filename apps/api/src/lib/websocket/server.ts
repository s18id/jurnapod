// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

export interface WsConnection {
  ws: WebSocket;
  userId: number;
  companyId: number;
  userName?: string;
  outletId?: number;
  isAuthenticated: boolean;
  connectedAt: Date;
  lastPingAt: Date;
  rooms: Set<string>;
}

export interface WsMessage {
  type: string;
  [key: string]: any;
}

export interface RoomClient {
  connection: WsConnection;
  ws: WebSocket;
}

export class WebSocketManager {
  private wss?: WebSocketServer;
  private connections: Map<WebSocket, WsConnection> = new Map();
  private rooms: Map<string, Map<WebSocket, RoomClient>> = new Map();
  private isRunning = false;
  private heartbeatInterval?: NodeJS.Timeout;
  private server: Server;

  constructor(server: Server) {
    this.server = server;
  }

  start(): void {
    if (this.isRunning) return;

    this.wss = new WebSocketServer({
      server: this.server,
      path: "/ws",
    });

    this.wss.on("connection", (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on("error", (error) => {
      console.error("WebSocket server error:", error);
    });

    this.isRunning = true;
    console.log("WebSocket server started on path /ws");

    this.startHeartbeat();
  }

  stop(): void {
    if (!this.isRunning) return;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    for (const [ws] of this.connections) {
      ws.close(1000, "Server shutting down");
    }
    this.connections.clear();
    this.rooms.clear();

    this.wss?.close();
    this.isRunning = false;
    console.log("WebSocket server stopped");
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const clientIp = req.socket.remoteAddress;
    console.log(`New WebSocket connection from ${clientIp}`);

    const connection: WsConnection = {
      ws,
      userId: 0,
      companyId: 0,
      isAuthenticated: false,
      connectedAt: new Date(),
      lastPingAt: new Date(),
      rooms: new Set(),
    };

    this.connections.set(ws, connection);

    ws.on("message", (data) => {
      this.handleMessage(ws, data);
    });

    ws.on("close", (code, reason) => {
      this.handleClose(ws, code, reason.toString());
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      this.connections.delete(ws);
    });

    ws.on("pong", () => {
      const conn = this.connections.get(ws);
      if (conn) {
        conn.lastPingAt = new Date();
      }
    });

    this.send(ws, {
      type: "connected",
      message: "Connection established. Send auth message to authenticate.",
      timestamp: Date.now(),
    });
  }

  private handleMessage(ws: WebSocket, data: any): void {
    try {
      const message: WsMessage = JSON.parse(data.toString());
      const conn = this.connections.get(ws);

      if (!conn) return;

      switch (message.type) {
        case "auth":
          this.handleAuth(ws, conn, message);
          break;
        case "subscribe":
          this.handleSubscribe(ws, conn, message.room);
          break;
        case "unsubscribe":
          this.handleUnsubscribe(ws, conn, message.room);
          break;
        case "ping":
          this.send(ws, { type: "pong", timestamp: Date.now() });
          break;
        default:
          if (!conn.isAuthenticated) {
            this.send(ws, { type: "error", message: "Authentication required" });
            return;
          }
      }
    } catch (error) {
      console.error("Failed to handle WebSocket message:", error);
      this.send(ws, { type: "error", message: "Invalid message format" });
    }
  }

  private handleAuth(ws: WebSocket, conn: WsConnection, message: WsMessage): void {
    const token = message.token;
    
    if (!token) {
      this.send(ws, { type: "auth_error", message: "Token required" });
      return;
    }

    // TODO: Implement proper JWT validation in Task 2
    // For now, accept tokens in format: "userId_companyId_token"
    // This is a placeholder that will be replaced with real JWT validation
    try {
      const parts = token.split("_");
      if (parts.length >= 2) {
        const userId = parseInt(parts[0], 10);
        const companyId = parseInt(parts[1], 10);
        
        if (!isNaN(userId) && !isNaN(companyId)) {
          conn.userId = userId;
          conn.companyId = companyId;
          conn.isAuthenticated = true;
          
          this.send(ws, { 
            type: "auth_success", 
            userId, 
            companyId,
            message: "Authenticated successfully" 
          });
          
          console.log(`User ${userId} authenticated for company ${companyId}`);
          return;
        }
      }
      
      // Fallback: accept any token for testing
      conn.userId = 1;
      conn.companyId = 1;
      conn.isAuthenticated = true;
      
      this.send(ws, { 
        type: "auth_success", 
        userId: 1, 
        companyId: 1,
        message: "Authenticated (test mode)" 
      });
    } catch {
      this.send(ws, { type: "auth_error", message: "Authentication failed" });
    }
  }

  private handleSubscribe(ws: WebSocket, conn: WsConnection, room: string): void {
    if (!room) {
      this.send(ws, { type: "error", message: "Room name required" });
      return;
    }

    // Validate room format
    if (!/^(company|outlet|user|admin):/.test(room)) {
      this.send(ws, { type: "error", message: "Invalid room format" });
      return;
    }

    // Check authorization for company room
    if (room.startsWith("company:") && conn.companyId > 0) {
      const roomCompanyId = parseInt(room.split(":")[1], 10);
      if (roomCompanyId !== conn.companyId) {
        this.send(ws, { type: "error", message: "Not authorized for this room" });
        return;
      }
    }

    // Add to room
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Map());
    }
    
    this.rooms.get(room)!.set(ws, { connection: conn, ws });
    conn.rooms.add(room);

    this.send(ws, { type: "subscribed", room });
    console.log(`Connection subscribed to room: ${room}`);
  }

  private handleUnsubscribe(ws: WebSocket, conn: WsConnection, room: string): void {
    if (!room) {
      this.send(ws, { type: "error", message: "Room name required" });
      return;
    }

    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(ws);
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }
    conn.rooms.delete(room);

    this.send(ws, { type: "unsubscribed", room });
  }

  private handleClose(ws: WebSocket, code: number, reason: string): void {
    const conn = this.connections.get(ws);
    if (conn) {
      // Remove from all rooms
      for (const room of conn.rooms) {
        const roomClients = this.rooms.get(room);
        if (roomClients) {
          roomClients.delete(ws);
          if (roomClients.size === 0) {
            this.rooms.delete(room);
          }
        }
      }
      conn.rooms.clear();
    }
    
    this.connections.delete(ws);
    console.log(`WebSocket closed: ${code} - ${reason}`);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [ws, conn] of this.connections) {
        if (now - conn.lastPingAt.getTime() > 60000) {
          console.log("Closing stale WebSocket connection");
          ws.terminate();
          this.connections.delete(ws);
          continue;
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }
    }, 30000);
  }

  private send(ws: WebSocket, message: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcast(room: string, message: WsMessage): void {
    const roomClients = this.rooms.get(room);
    if (!roomClients) return;

    const messageStr = JSON.stringify(message);
    
    for (const { ws } of roomClients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  broadcastToCompany(companyId: number, message: WsMessage): void {
    this.broadcast(`company:${companyId}`, message);
  }

  broadcastToAll(message: WsMessage): void {
    const messageStr = JSON.stringify(message);
    
    for (const [ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getAuthenticatedCount(): number {
    return Array.from(this.connections.values()).filter((c) => c.isAuthenticated).length;
  }

  getStats(): { total: number; authenticated: number; rooms: number } {
    return {
      total: this.connections.size,
      authenticated: this.getAuthenticatedCount(),
      rooms: this.rooms.size,
    };
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

let wsManagerInstance: WebSocketManager | null = null;

export function initWebSocketManager(server: Server): WebSocketManager {
  wsManagerInstance = new WebSocketManager(server);
  return wsManagerInstance;
}

export function getWebSocketManager(): WebSocketManager | null {
  return wsManagerInstance;
}
