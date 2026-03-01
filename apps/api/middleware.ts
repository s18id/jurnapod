// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NextRequest, NextResponse } from "next/server";

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
      "http://localhost:5173",  // POS (Vite)
      "http://127.0.0.1:3002",  // Backoffice (alternative)
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
 */
export function middleware(request: NextRequest) {
  // Get the origin from the request
  const origin = request.headers.get("origin");
  
  // Get allowed origins for current environment
  const allowedOrigins = getAllowedOrigins();

  // Handle preflight OPTIONS request
  if (request.method === "OPTIONS") {
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

  return response;
}

/**
 * Configure which routes this middleware applies to
 * Apply to all /api routes
 */
export const config = {
  matcher: "/api/:path*",
};
