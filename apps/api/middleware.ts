// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NextRequest, NextResponse } from "next/server";

const HTTP_LOG_ENABLED = process.env.JP_HTTP_LOG === "1";
const HTTP_LOG_HEALTH = process.env.JP_HTTP_LOG_HEALTH === "1";

function shouldLog(path: string): boolean {
  if (!HTTP_LOG_ENABLED) return false;
  if (!HTTP_LOG_HEALTH && path === "/api/health") return false;
  return true;
}

function logRequest(method: string, path: string, status: number, durationMs: number, origin: string | null) {
  const originStr = origin || "-";
  console.log(`[api-hit] ${method} ${path} ${status} in ${durationMs}ms origin=${originStr}`);
}

/**
 * Get allowed CORS origins based on environment
 * Development: localhost origins for Vite dev servers
 * Production: configured via CORS_ALLOWED_ORIGINS env var
 */
function getAllowedOrigins(): string[] {
  const isDevelopment = process.env.NODE_ENV === "development";
  
  if (isDevelopment) {
    // Development: Allow local Vite dev servers
    return [
      "http://localhost:3002",  // Backoffice (Vite)
      "http://localhost:4173",  // POS (E2E)
      "http://localhost:5173",  // POS (Vite)
      "http://127.0.0.1:3002",  // Backoffice (alternative)
      "http://127.0.0.1:4173",  // POS (E2E alternative)
      "http://127.0.0.1:5173",  // POS (alternative)
    ];
  }
  
  // Production: Load from environment variable
  const corsOrigins = process.env.CORS_ALLOWED_ORIGINS;
  
  if (!corsOrigins) {
    console.warn("CORS_ALLOWED_ORIGINS not set in production. CORS will be disabled.");
    return [];
  }
  
  // Parse comma-separated origins
  return corsOrigins
    .split(",")
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

/**
 * Middleware to add CORS headers
 * Development: Allows requests from Vite dev servers
 * Production: Uses CORS_ALLOWED_ORIGINS environment variable
 * 
 * Optional HTTP logging: set JP_HTTP_LOG=1 to enable, JP_HTTP_LOG_HEALTH=1 to include health checks
 */
export function middleware(request: NextRequest) {
  const startTime = Date.now();
  const path = request.nextUrl.pathname;
  const method = request.method;
  const origin = request.headers.get("origin");

  // Get allowed origins for current environment
  const allowedOrigins = getAllowedOrigins();

  // Handle preflight OPTIONS request
  if (method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }
    
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    response.headers.set("Access-Control-Max-Age", "86400"); // 24 hours
    response.headers.set("Access-Control-Allow-Credentials", "true");
    
    return response;
  }

  // Handle actual request
  const response = NextResponse.next();

  // Add CORS headers if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  }

  // Log HTTP request if enabled
  if (shouldLog(path)) {
    const durationMs = Date.now() - startTime;
    logRequest(method, path, response.status, durationMs, origin);
  }

  return response;
}

/**
 * Configure which routes this middleware applies to
 * Apply to all /api routes
 */
export const config = {
  matcher: "/api/:path*",
};
