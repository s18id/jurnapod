// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { apiRequest, ApiError } from "../lib/api-client";

type PublicPageResponse = {
  ok: true;
  page: {
    slug: string;
    title: string;
    content_html: string;
    updated_at: string;
    published_at: string | null;
  };
};

type LoadState = "loading" | "ready" | "not_found" | "error";

type PublicStaticPageProps = {
  slug: string;
  fallbackTitle: string;
};

const shellStyle = {
  minHeight: "100vh",
  background: "linear-gradient(160deg, #f6f2ea 0%, #ece8df 100%)",
  padding: "32px 16px",
  color: "#1f2a28",
  fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
} as const;

const cardStyle = {
  maxWidth: "860px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: "1px solid #d9d2c7",
  borderRadius: "14px",
  padding: "28px",
  boxShadow: "0 10px 20px rgba(0, 0, 0, 0.05)"
} as const;

const titleStyle = {
  marginTop: 0,
  marginBottom: "6px",
  fontSize: "26px"
} as const;

const metaStyle = {
  color: "#5b6664",
  fontSize: "13px",
  marginBottom: "18px"
} as const;

const contentStyle = {
  lineHeight: 1.7,
  color: "#1f2937"
} as const;

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}

export function PublicStaticPage({ slug, fallbackTitle }: PublicStaticPageProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [title, setTitle] = useState(fallbackTitle);
  const [contentHtml, setContentHtml] = useState("");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        const response = await apiRequest<PublicPageResponse>(`/pages/${slug}`);
        if (cancelled) {
          return;
        }
        setTitle(response.page.title || fallbackTitle);
        setContentHtml(response.page.content_html || "");
        setPublishedAt(response.page.published_at ?? response.page.updated_at ?? null);
        setState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.code === "NOT_FOUND") {
          setState("not_found");
          return;
        }
        setState("error");
      }
    }

    loadPage();

    return () => {
      cancelled = true;
    };
  }, [fallbackTitle, slug]);

  const sanitizedHtml = useMemo(() => {
    if (!contentHtml) {
      return "";
    }
    return DOMPurify.sanitize(contentHtml, {
      ALLOWED_TAGS: [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "br",
        "strong",
        "em",
        "ul",
        "ol",
        "li",
        "blockquote",
        "code",
        "pre",
        "hr",
        "a",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td"
      ],
      ALLOWED_ATTR: ["href", "name", "target", "rel", "title"]
    });
  }, [contentHtml]);

  return (
    <main style={shellStyle}>
      <section style={cardStyle}>
        {state === "loading" ? <p>Loading privacy policy...</p> : null}
        {state === "error" ? (
          <div>
            <h2 style={titleStyle}>{fallbackTitle}</h2>
            <p>We could not load this page. Please try again later.</p>
          </div>
        ) : null}
        {state === "not_found" ? (
          <div>
            <h2 style={titleStyle}>{fallbackTitle}</h2>
            <p>This page is not available yet.</p>
          </div>
        ) : null}
        {state === "ready" ? (
          <div>
            <h1 style={titleStyle}>{title}</h1>
            {publishedAt ? (
              <p style={metaStyle}>Effective date: {formatDate(publishedAt)}</p>
            ) : null}
            <div style={contentStyle} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function PrivacyPage() {
  return <PublicStaticPage slug="privacy" fallbackTitle="Privacy Policy" />;
}

export function TermsPage() {
  return <PublicStaticPage slug="terms" fallbackTitle="Terms of Service" />;
}
