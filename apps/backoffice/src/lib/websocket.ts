// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import ReconnectingWebSocket from "reconnecting-websocket";
import { getStoredAccessToken } from "./session";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting" | "error";

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

type MessageHandler = (message: WebSocketMessage) => void;

interface WebSocketOptions {
  maxRetries?: number;
  reconnectionDelayGrowFactor?: number;
  maxReconnectionDelay?: number;
}

class WebSocketClient {
  private ws?: ReconnectingWebSocket;
  private status: ConnectionStatus = "disconnected";
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private statusHandlers: Set<(status: ConnectionStatus) => void> = new Set();
  private companyId: number | null = null;
  private userId: number | null = null;
  private token: string | null = null;
  private url: string;

  constructor() {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    this.url = `${wsProtocol}//${host}/ws`;
  }

  connect(): void {
    if (this.ws) {
      return;
    }

    const token = getStoredAccessToken();
    if (!token) {
      console.warn("No auth token, cannot connect WebSocket");
      return;
    }

    this.token = token;

    this.setStatus("connecting");

    const options: WebSocketOptions = {
      maxRetries: 10,
      reconnectionDelayGrowFactor: 1.5,
      maxReconnectionDelay: 30000,
    };

    this.ws = new ReconnectingWebSocket(`${this.url}?token=${token}`, [], options);

    this.ws.onopen = () => {
      this.setStatus("connected");
    };

    this.ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      this.setStatus("disconnected");
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.setStatus("error");
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, "Client disconnecting");
      this.ws = undefined;
    }
    this.setStatus("disconnected");
  }

  private handleMessage(message: WebSocketMessage): void {
    // Handle connection-related messages
    if (message.type === "connected" || message.type === "auth_success" || message.type === "auth_error") {
      console.log("WebSocket auth:", message.type, message);
      
      // After successful auth, subscribe to company room
      if (message.type === "auth_success" && message.companyId) {
        this.companyId = message.companyId;
        this.subscribeToCompany();
      }
      return;
    }

    // Dispatch to registered handlers
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }

    // Also dispatch to wildcard handlers
    const wildcardHandlers = this.handlers.get("*");
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => handler(message));
    }
  }

  private subscribeToCompany(): void {
    if (!this.ws || !this.companyId) return;

    this.ws.send(
      JSON.stringify({
        type: "subscribe",
        room: `company:${this.companyId}`,
      })
    );
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  on(event: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);

    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === "connected";
  }

  send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not connected, cannot send message");
      return;
    }
    this.ws.send(JSON.stringify(message));
  }
}

let wsClientInstance: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClientInstance) {
    wsClientInstance = new WebSocketClient();
  }
  return wsClientInstance;
}

export function connectWebSocket(): void {
  const client = getWebSocketClient();
  client.connect();
}

export function disconnectWebSocket(): void {
  const client = getWebSocketClient();
  client.disconnect();
}
