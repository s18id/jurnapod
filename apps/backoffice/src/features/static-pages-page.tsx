import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { SessionUser } from "../lib/session";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";

type StaticPagesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type StaticPageStatus = "DRAFT" | "PUBLISHED";

type StaticPageSummary = {
  id: number;
  slug: string;
  title: string;
  status: StaticPageStatus;
  updated_at: string;
  published_at: string | null;
};

type StaticPageDetail = {
  id: number;
  slug: string;
  title: string;
  content_md: string;
  status: StaticPageStatus;
  updated_at: string;
  published_at: string | null;
  meta_json: Record<string, any> | null;
};

type StaticPagesListResponse = {
  ok: true;
  pages: StaticPageSummary[];
};

type StaticPageResponse = {
  ok: true;
  page: StaticPageDetail;
};

type FormState = {
  slug: string;
  title: string;
  content_md: string;
};

const SLUG_PATTERN = /^[a-z0-9-]+$/;

const cardStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fcfbf8"
} as const;

const splitLayoutStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) minmax(340px, 1.4fr)",
  gap: "16px"
} as const;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const
};

const cellStyle = {
  borderBottom: "1px solid #ece7dc",
  padding: "8px",
  fontSize: "13px"
} as const;

const inputStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "8px 10px",
  width: "100%"
} as const;

const textareaStyle = {
  ...inputStyle,
  minHeight: "220px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: "13px",
  lineHeight: 1.5
} as const;

const buttonStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "8px 12px",
  backgroundColor: "#fff",
  cursor: "pointer"
} as const;

const primaryButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#2f5f4a",
  color: "#fff",
  borderColor: "#2f5f4a"
} as const;

const warningButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#f39c12",
  color: "#fff",
  borderColor: "#f39c12"
} as const;

const statusBadgeBase = {
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: "4px",
  fontSize: "11px",
  fontWeight: 700 as const
};

const statusDraftStyle = {
  ...statusBadgeBase,
  backgroundColor: "#fdf2d0",
  color: "#8a6d3b"
};

const statusPublishedStyle = {
  ...statusBadgeBase,
  backgroundColor: "#d4edda",
  color: "#155724"
};

const helperTextStyle = {
  margin: "6px 0 0",
  fontSize: "12px",
  color: "#6b5b4d"
} as const;

const errorTextStyle = {
  margin: "6px 0 0",
  fontSize: "12px",
  color: "#b00020"
} as const;

const previewStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#ffffff",
  minHeight: "220px",
  overflow: "auto"
} as const;

const emptyForm: FormState = {
  slug: "",
  title: "",
  content_md: ""
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function buildStatusBadge(status: StaticPageStatus) {
  if (status === "PUBLISHED") {
    return <span style={statusPublishedStyle}>PUBLISHED</span>;
  }
  return <span style={statusDraftStyle}>DRAFT</span>;
}

export function StaticPagesPage({ accessToken }: StaticPagesPageProps) {
  const isOnline = useOnlineStatus();
  const [pages, setPages] = useState<StaticPageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState<StaticPageStatus>("DRAFT");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");

  const sanitizer = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return DOMPurify(window);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refreshList() {
      setLoadingList(true);
      setError(null);
      try {
        const params = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
        const response = await apiRequest<StaticPagesListResponse>(
          `/admin/pages${params}`,
          {},
          accessToken
        );
        if (!cancelled) {
          setPages(response.pages);
        }
      } catch (fetchError) {
        if (!cancelled) {
          if (fetchError instanceof ApiError) {
            setError(fetchError.message);
          } else {
            setError("Failed to load static pages.");
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingList(false);
        }
      }
    }

    if (isOnline) {
      refreshList();
    }

    return () => {
      cancelled = true;
    };
  }, [accessToken, isOnline, search]);

  useEffect(() => {
    let cancelled = false;
    async function renderPreview() {
      const parsed = await Promise.resolve(marked.parse(form.content_md ?? ""));
      const sanitized = sanitizer
        ? sanitizer.sanitize(parsed, {
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
          })
        : parsed;

      if (!cancelled) {
        setPreviewHtml(sanitized);
      }
    }

    renderPreview().catch(() => {
      if (!cancelled) {
        setPreviewHtml("<p>Preview failed.</p>");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [form.content_md, sanitizer]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Static Pages"
        message="Static page editing requires an active connection."
      />
    );
  }

  const isEditing = selectedId != null;
  const slugValue = form.slug.trim();
  const titleValue = form.title.trim();
  const contentValue = form.content_md.trim();
  const slugValid = slugValue.length > 0 && SLUG_PATTERN.test(slugValue);

  function resetForm() {
    setSelectedId(null);
    setForm(emptyForm);
    setStatus("DRAFT");
    setFormError(null);
  }

  async function selectPage(pageId: number) {
    setSelectedId(pageId);
    setLoadingDetail(true);
    setError(null);
    try {
      const response = await apiRequest<StaticPageResponse>(
        `/admin/pages/${pageId}`,
        {},
        accessToken
      );
      setForm({
        slug: response.page.slug,
        title: response.page.title,
        content_md: response.page.content_md
      });
      setStatus(response.page.status);
      setFormError(null);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load static page details.");
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleSave() {
    setFormError(null);
    setError(null);
    if (!slugValid) {
      setFormError("Slug must be lowercase and contain only letters, numbers, or hyphens.");
      return;
    }
    if (!titleValue) {
      setFormError("Title is required.");
      return;
    }
    if (!contentValue) {
      setFormError("Content cannot be empty.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && selectedId != null) {
        const response = await apiRequest<StaticPageResponse>(
          `/admin/pages/${selectedId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              slug: slugValue,
              title: titleValue,
              content_md: form.content_md
            })
          },
          accessToken
        );
        setForm({
          slug: response.page.slug,
          title: response.page.title,
          content_md: response.page.content_md
        });
        setStatus(response.page.status);
        await refreshList();
      } else {
        const response = await apiRequest<StaticPageResponse>(
          "/admin/pages",
          {
            method: "POST",
            body: JSON.stringify({
              slug: slugValue,
              title: titleValue,
              content_md: form.content_md,
              status: "DRAFT"
            })
          },
          accessToken
        );
        setSelectedId(response.page.id);
        setStatus(response.page.status);
        await refreshList();
      }
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Failed to save static page.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish() {
    setFormError(null);
    setError(null);
    if (!slugValid) {
      setFormError("Slug must be lowercase and contain only letters, numbers, or hyphens.");
      return;
    }
    if (!titleValue) {
      setFormError("Title is required.");
      return;
    }
    if (!contentValue) {
      setFormError("Content cannot be empty.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && selectedId != null) {
        const response = await apiRequest<StaticPageResponse>(
          `/admin/pages/${selectedId}/publish`,
          { method: "POST" },
          accessToken
        );
        setStatus(response.page.status);
        await refreshList();
      } else {
        const response = await apiRequest<StaticPageResponse>(
          "/admin/pages",
          {
            method: "POST",
            body: JSON.stringify({
              slug: slugValue,
              title: titleValue,
              content_md: form.content_md,
              status: "PUBLISHED"
            })
          },
          accessToken
        );
        setSelectedId(response.page.id);
        setStatus(response.page.status);
        await refreshList();
      }
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Failed to publish static page.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnpublish() {
    if (!isEditing || selectedId == null) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<StaticPageResponse>(
        `/admin/pages/${selectedId}/unpublish`,
        { method: "POST" },
        accessToken
      );
      setStatus(response.page.status);
      await refreshList();
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Failed to unpublish static page.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshList() {
    const params = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    const response = await apiRequest<StaticPagesListResponse>(
      `/admin/pages${params}`,
      {},
      accessToken
    );
    setPages(response.pages);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Static Pages</h2>
          <p style={{ margin: "6px 0 0", color: "#5b6664" }}>
            Manage public Markdown pages for Privacy, Terms, and other documents.
          </p>
        </div>
        <button type="button" style={buttonStyle} onClick={resetForm} disabled={submitting}>
          New Page
        </button>
      </header>

      {error ? (
        <div style={{ ...cardStyle, borderColor: "#f5c6cb", backgroundColor: "#f8d7da" }}>
          <strong>Request failed.</strong> {error}
        </div>
      ) : null}

      <section style={splitLayoutStyle}>
        <div style={cardStyle}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              type="search"
              placeholder="Search slug or title"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={inputStyle}
            />
          </div>
          {loadingList ? <p>Loading pages...</p> : null}
          {pages.length === 0 && !loadingList ? (
            <p style={{ margin: 0 }}>No static pages found.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...cellStyle, textAlign: "left" }}>Slug</th>
                  <th style={{ ...cellStyle, textAlign: "left" }}>Title</th>
                  <th style={{ ...cellStyle, textAlign: "left" }}>Status</th>
                  <th style={{ ...cellStyle, textAlign: "left" }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr
                    key={page.id}
                    onClick={() => selectPage(page.id)}
                    style={{
                      cursor: "pointer",
                      backgroundColor: page.id === selectedId ? "#f3f8f5" : "transparent"
                    }}
                  >
                    <td style={cellStyle}>{page.slug}</td>
                    <td style={cellStyle}>{page.title}</td>
                    <td style={cellStyle}>{buildStatusBadge(page.status)}</td>
                    <td style={cellStyle}>{formatDateTime(page.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Editor</h3>
            {loadingDetail ? <p>Loading page...</p> : null}
            <label style={{ display: "block", marginBottom: "8px" }}>
              <span style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>Slug</span>
              <input
                value={form.slug}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder="privacy-policy"
                style={inputStyle}
              />
              <p style={helperTextStyle}>Lowercase letters, numbers, and hyphens only.</p>
            </label>

            <label style={{ display: "block", marginBottom: "8px" }}>
              <span style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Privacy Policy"
                style={inputStyle}
              />
            </label>

            <label style={{ display: "block", marginBottom: "8px" }}>
              <span style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>
                Markdown Content
              </span>
              <textarea
                value={form.content_md}
                onChange={(event) => setForm((prev) => ({ ...prev, content_md: event.target.value }))}
                placeholder="# Privacy Policy\n\nWrite the content here."
                style={textareaStyle}
              />
            </label>

            {formError ? <p style={errorTextStyle}>{formError}</p> : null}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
              <button type="button" style={primaryButtonStyle} onClick={handleSave} disabled={submitting}>
                Save Draft
              </button>
              <button type="button" style={warningButtonStyle} onClick={handlePublish} disabled={submitting}>
                Publish
              </button>
              <button
                type="button"
                style={buttonStyle}
                onClick={handleUnpublish}
                disabled={submitting || status !== "PUBLISHED"}
              >
                Unpublish
              </button>
              <span style={{ alignSelf: "center" }}>{buildStatusBadge(status)}</span>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Preview</h3>
            <div style={previewStyle} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      </section>
    </div>
  );
}
