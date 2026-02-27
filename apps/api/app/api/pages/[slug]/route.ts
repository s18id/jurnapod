import { getPublishedStaticPage } from "../../../../src/lib/static-pages";

const NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "NOT_FOUND"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
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

    return Response.json(
      {
        ok: true,
        page
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/pages/:slug failed", error);
    return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
  }
}
