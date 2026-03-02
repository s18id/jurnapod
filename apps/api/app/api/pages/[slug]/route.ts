// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getPublishedStaticPage } from "../../../../src/lib/static-pages";
import { successResponse } from "../../../../src/lib/response";

const NOT_FOUND_RESPONSE = {
  success: false,
  error: {
    code: "NOT_FOUND"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  success: false,
  error: {
    code: "INTERNAL_SERVER_ERROR"
  }
};

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
      return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
    }

    const page = await getPublishedStaticPage(slug);
    if (!page) {
      return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
    }

    return successResponse(page);
  } catch (error) {
    console.error("GET /api/pages/:slug failed", error);
    return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
  }
}
