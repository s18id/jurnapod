// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getPublishedStaticPage } from "../../../../src/lib/static-pages";
import { errorResponse, successResponse } from "../../../../src/lib/response";

function parsePageSlug(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const slugIndex = parts.indexOf("pages") + 1;
  return decodeURIComponent(parts[slugIndex] ?? "").trim();
}

export async function GET(request: Request) {
  try {
    const slug = parsePageSlug(request);
    if (!slug) {
      return errorResponse("NOT_FOUND", "Not found", 404);
    }

    const page = await getPublishedStaticPage(slug);
    if (!page) {
      return errorResponse("NOT_FOUND", "Not found", 404);
    }

    return successResponse(page);
  } catch (error) {
    console.error("GET /api/pages/:slug failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Internal server error", 500);
  }
}
