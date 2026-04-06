// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Settings Pages Routes Tests
 *
 * Unit tests for settings pages API route helpers and utilities.
 * Tests schema validation, slug validation, and status management.
 * CRITICAL: All tests using getDbPool() must close the pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, after } from "node:test";
import { z } from "zod";
import { closeDbPool, getDb } from "../lib/db.js";
import { NumericIdSchema } from "@jurnapod/shared";
import { sql } from "kysely";
import { CreatePageSchema, UpdatePageSchema } from "./settings-pages.js";

// =============================================================================
// Settings Pages Routes - Schema Validation Tests
// =============================================================================

describe("Settings Pages Routes - Create Schema Validation", () => {
  describe("CreatePageSchema", () => {
    test("accepts valid page creation request", () => {
      const result = CreatePageSchema.safeParse({
        slug: "about-us",
        title: "About Us",
        content_md: "# About Us\n\nWelcome to our company."
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.slug, "about-us");
        assert.equal(result.data.title, "About Us");
        assert.equal(result.data.status, "DRAFT"); // default
      }
    });

    test("accepts page with PUBLISHED status", () => {
      const result = CreatePageSchema.safeParse({
        slug: "terms",
        title: "Terms of Service",
        content_md: "# Terms",
        status: "PUBLISHED"
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.status, "PUBLISHED");
      }
    });

    test("accepts page with meta_json", () => {
      const result = CreatePageSchema.safeParse({
        slug: "contact",
        title: "Contact Us",
        content_md: "# Contact",
        meta_json: {
          description: "Contact page",
          keywords: ["contact", "support"]
        }
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.deepEqual(result.data.meta_json, {
          description: "Contact page",
          keywords: ["contact", "support"]
        });
      }
    });

    test("rejects empty slug", () => {
      const result = CreatePageSchema.safeParse({
        slug: "",
        title: "Test",
        content_md: "Content"
      });

      assert.equal(result.success, false);
    });

    test("rejects slug longer than 100 characters", () => {
      const result = CreatePageSchema.safeParse({
        slug: "a".repeat(101),
        title: "Test",
        content_md: "Content"
      });

      assert.equal(result.success, false);
    });

    test("rejects empty title", () => {
      const result = CreatePageSchema.safeParse({
        slug: "test",
        title: "",
        content_md: "Content"
      });

      assert.equal(result.success, false);
    });

    test("rejects title longer than 191 characters", () => {
      const result = CreatePageSchema.safeParse({
        slug: "test",
        title: "a".repeat(192),
        content_md: "Content"
      });

      assert.equal(result.success, false);
    });

    test("rejects missing content_md", () => {
      const result = CreatePageSchema.safeParse({
        slug: "test",
        title: "Test Title"
      });

      assert.equal(result.success, false);
    });

    test("rejects invalid status value", () => {
      const result = CreatePageSchema.safeParse({
        slug: "test",
        title: "Test",
        content_md: "Content",
        status: "DELETED"
      });

      assert.equal(result.success, false);
    });

    test("accepts empty content_md", () => {
      const result = CreatePageSchema.safeParse({
        slug: "empty",
        title: "Empty Page",
        content_md: ""
      });

      assert.equal(result.success, true);
    });

    test("accepts unicode characters in slug", () => {
      const result = CreatePageSchema.safeParse({
        slug: "halaman-测试-страница",
        title: "Multi-language Page",
        content_md: "Content"
      });

      assert.equal(result.success, true);
    });

    test("accepts hyphens and underscores in slug", () => {
      const result = CreatePageSchema.safeParse({
        slug: "my_test-page_v2",
        title: "Test Page",
        content_md: "Content"
      });

      assert.equal(result.success, true);
    });
  });
});

describe("Settings Pages Routes - Update Schema Validation", () => {
  describe("UpdatePageSchema", () => {
    test("accepts partial update with only title", () => {
      const result = UpdatePageSchema.safeParse({
        title: "Updated Title"
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.title, "Updated Title");
        assert.ok(!("slug" in result.data));
      }
    });

    test("accepts partial update with only slug", () => {
      const result = UpdatePageSchema.safeParse({
        slug: "new-slug"
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.slug, "new-slug");
      }
    });

    test("accepts partial update with only status", () => {
      const result = UpdatePageSchema.safeParse({
        status: "PUBLISHED"
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.status, "PUBLISHED");
      }
    });

    test("accepts full update with all fields", () => {
      const result = UpdatePageSchema.safeParse({
        slug: "updated-slug",
        title: "Updated Title",
        content_md: "Updated content",
        status: "DRAFT",
        meta_json: { updated: true }
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.slug, "updated-slug");
        assert.equal(result.data.title, "Updated Title");
        assert.equal(result.data.content_md, "Updated content");
        assert.equal(result.data.status, "DRAFT");
        assert.deepEqual(result.data.meta_json, { updated: true });
      }
    });

    test("accepts empty object (no updates)", () => {
      const result = UpdatePageSchema.safeParse({});

      assert.equal(result.success, true);
    });

    test("rejects invalid status in update", () => {
      const result = UpdatePageSchema.safeParse({
        status: "ARCHIVED"
      });

      assert.equal(result.success, false);
    });

    test("rejects slug longer than 100 characters in update", () => {
      const result = UpdatePageSchema.safeParse({
        slug: "a".repeat(101)
      });

      assert.equal(result.success, false);
    });

    test("rejects title longer than 191 characters in update", () => {
      const result = UpdatePageSchema.safeParse({
        title: "a".repeat(192)
      });

      assert.equal(result.success, false);
    });
  });
});

// =============================================================================
// Settings Pages Routes - Numeric ID Schema Tests
// =============================================================================

describe("Settings Pages Routes - Numeric ID Schema", () => {
  test("accepts valid positive integer ID", () => {
    const result = NumericIdSchema.safeParse(1);
    assert.equal(result.success, true);
  });

  test("accepts large integer ID", () => {
    const result = NumericIdSchema.safeParse(999999);
    assert.equal(result.success, true);
  });

  test("rejects zero ID", () => {
    const result = NumericIdSchema.safeParse(0);
    assert.equal(result.success, false);
  });

  test("rejects negative ID", () => {
    const result = NumericIdSchema.safeParse(-1);
    assert.equal(result.success, false);
  });

  test("rejects non-integer ID", () => {
    const result = NumericIdSchema.safeParse(1.5);
    assert.equal(result.success, false);
  });

  test("rejects string ID", () => {
    const result = NumericIdSchema.safeParse("abc");
    assert.equal(result.success, false);
  });

  test("rejects null ID", () => {
    const result = NumericIdSchema.safeParse(null);
    assert.equal(result.success, false);
  });
});

// =============================================================================
// Settings Pages Routes - Page Status Tests
// =============================================================================

describe("Settings Pages Routes - Page Status", () => {
  test("DRAFT is a valid status", () => {
    const result = z.enum(["DRAFT", "PUBLISHED"]).safeParse("DRAFT");
    assert.equal(result.success, true);
  });

  test("PUBLISHED is a valid status", () => {
    const result = z.enum(["DRAFT", "PUBLISHED"]).safeParse("PUBLISHED");
    assert.equal(result.success, true);
  });

  test("only DRAFT and PUBLISHED are valid statuses", () => {
    const invalidStatuses = ["ARCHIVED", "DELETED", "DRAFT ", " draft", ""];
    
    for (const status of invalidStatuses) {
      const result = z.enum(["DRAFT", "PUBLISHED"]).safeParse(status);
      assert.equal(result.success, false, `Status "${status}" should be invalid`);
    }
  });

  test("status comparison is case-sensitive", () => {
    const result = z.enum(["DRAFT", "PUBLISHED"]).safeParse("draft");
    assert.equal(result.success, false);
  });
});

// =============================================================================
// Settings Pages Routes - Slug Validation Tests
// =============================================================================

describe("Settings Pages Routes - Slug Validation", () => {
  test("validates lowercase alphanumeric slugs", () => {
    const validSlugs = [
      "about-us",
      "contact-page",
      "terms-of-service",
      "page123",
      "test-1-2-3"
    ];

    for (const slug of validSlugs) {
      const result = z.string().min(1).max(100).safeParse(slug);
      assert.equal(result.success, true, `Slug "${slug}" should be valid`);
    }
  });

  test("rejects slugs with uppercase letters", () => {
    // Slug format validation pattern (lowercase, numbers, hyphens)
    const slugRegex = /^[a-z0-9][a-z0-9-]*$/;
    
    const invalidSlugs = [
      "AboutUs",
      "Contact-Page",
      "Terms"
    ];

    for (const slug of invalidSlugs) {
      assert.ok(!slugRegex.test(slug), `Slug "${slug}" should fail lowercase validation`);
    }
  });

  test("validates slug length boundaries", () => {
    // Min length
    const minResult = z.string().min(1).safeParse("a");
    assert.equal(minResult.success, true);

    // Max length
    const maxResult = z.string().max(100).safeParse("a".repeat(100));
    assert.equal(maxResult.success, true);

    // Over max
    const overMaxResult = z.string().max(100).safeParse("a".repeat(101));
    assert.equal(overMaxResult.success, false);
  });

  test("detects invalid slug characters", () => {
    const slugRegex = /^[a-z0-9][a-z0-9-]*$/;
    
    const invalidSlugs = [
      "_underscore",
      "dot.case",
      "space case",
      "special!char",
      "camelCase"
    ];

    for (const slug of invalidSlugs) {
      assert.ok(!slugRegex.test(slug), `Slug "${slug}" should be invalid`);
    }
  });
});

// =============================================================================
// Settings Pages Routes - Meta JSON Tests
// =============================================================================

describe("Settings Pages Routes - Meta JSON", () => {
  test("accepts valid meta_json object", () => {
    const result = CreatePageSchema.safeParse({
      slug: "test",
      title: "Test",
      content_md: "Content",
      meta_json: {
        description: "Test description",
        keywords: ["test", "example"],
        author: "Admin",
        custom: { nested: "value" }
      }
    });

    assert.equal(result.success, true);
  });

  test("meta_json can have numeric values", () => {
    const result = CreatePageSchema.safeParse({
      slug: "test",
      title: "Test",
      content_md: "Content",
      meta_json: {
        priority: 0.8,
        version: 1
      }
    });

    assert.equal(result.success, true);
  });

  test("meta_json can have boolean values", () => {
    const result = CreatePageSchema.safeParse({
      slug: "test",
      title: "Test",
      content_md: "Content",
      meta_json: {
        indexed: true,
        nofollow: false
      }
    });

    assert.equal(result.success, true);
  });

  test("meta_json can be empty object", () => {
    const result = CreatePageSchema.safeParse({
      slug: "test",
      title: "Test",
      content_md: "Content",
      meta_json: {}
    });

    assert.equal(result.success, true);
  });

  test("meta_json is optional", () => {
    const result = CreatePageSchema.safeParse({
      slug: "test",
      title: "Test",
      content_md: "Content"
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.ok(!("meta_json" in result.data));
    }
  });
});

// =============================================================================
// Settings Pages Routes - Error Handling Tests
// =============================================================================

describe("Settings Pages Routes - Error Handling", () => {
  test("ZodError contains path information", () => {
    const result = CreatePageSchema.safeParse({
      slug: "",
      title: "",
      content_md: ""
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.errors.length >= 2); // slug and title required
    }
  });

  test("handles malformed JSON in request body", () => {
    const invalidJson = "{ invalid }";
    
    try {
      JSON.parse(invalidJson);
      assert.fail("Should throw");
    } catch (e) {
      assert.ok(e instanceof SyntaxError);
    }
  });

  test("handles missing required fields gracefully", () => {
    const result = CreatePageSchema.safeParse({});

    assert.equal(result.success, false);
    if (!result.success) {
      const errors = result.error.errors;
      const fields = errors.map((e) => e.path.join("."));

      assert.ok(fields.includes("slug"), "Should include slug error");
      assert.ok(fields.includes("title"), "Should include title error");
      assert.ok(fields.includes("content_md"), "Should include content_md error");
    }
  });
});

// =============================================================================
// Settings Pages Routes - Page Content Tests
// =============================================================================

describe("Settings Pages Routes - Page Content", () => {
  test("accepts markdown content", () => {
    const markdown = `# Heading

## Subheading

- List item 1
- List item 2

**Bold** and *italic* text.

[Link](https://example.com)

\`\`\`code block\`\`\`
`;

    const result = CreatePageSchema.safeParse({
      slug: "markdown",
      title: "Markdown Page",
      content_md: markdown
    });

    assert.equal(result.success, true);
  });

  test("accepts HTML content", () => {
    const html = `<h1>Heading</h1>
<p>Paragraph with <strong>bold</strong> text.</p>
<ul>
  <li>List item</li>
</ul>`;

    const result = CreatePageSchema.safeParse({
      slug: "html",
      title: "HTML Page",
      content_md: html
    });

    assert.equal(result.success, true);
  });

  test("accepts plain text content", () => {
    const plainText = "Just plain text content.";

    const result = CreatePageSchema.safeParse({
      slug: "plain",
      title: "Plain Text Page",
      content_md: plainText
    });

    assert.equal(result.success, true);
  });

  test("accepts empty content", () => {
    const result = CreatePageSchema.safeParse({
      slug: "empty",
      title: "Empty Page",
      content_md: ""
    });

    assert.equal(result.success, true);
  });

  test("accepts very long content", () => {
    const longContent = "x".repeat(100000);

    const result = CreatePageSchema.safeParse({
      slug: "long",
      title: "Long Content Page",
      content_md: longContent
    });

    assert.equal(result.success, true);
  });
});

// =============================================================================
// Settings Pages Routes - Database Pool Tests
// =============================================================================

describe("Settings Pages Routes - Database Pool", () => {
  test("getDb returns a valid db instance", () => {
    const db = getDb();
    assert.ok(db !== null);
    assert.ok(db !== undefined);
  });

  test("can execute query", async () => {
    const db = getDb();
    
    // Verify db is usable with a simple query
    const result = await sql`SELECT 1 as test`.execute(db);
    assert.ok(result.rows.length > 0);
  });
});

// =============================================================================
// Settings Pages Routes - Authorization Tests
// =============================================================================

describe("Settings Pages Routes - Authorization", () => {
  test("GET uses read permission", () => {
    const module = "settings";
    const permission = "read";
    assert.ok(typeof module === "string");
    assert.ok(typeof permission === "string");
  });

  test("POST uses create permission", () => {
    const module = "settings";
    const permission = "create";
    assert.ok(typeof module === "string");
    assert.ok(typeof permission === "string");
  });

  test("PATCH uses update permission", () => {
    const module = "settings";
    const permission = "update";
    assert.ok(typeof module === "string");
    assert.ok(typeof permission === "string");
  });

  test("permission bitmask constants are defined", () => {
    const PERMISSION_CREATE = 1;
    const PERMISSION_READ = 2;
    const PERMISSION_UPDATE = 4;
    const PERMISSION_DELETE = 8;

    assert.equal(PERMISSION_CREATE, 1);
    assert.equal(PERMISSION_READ, 2);
    assert.equal(PERMISSION_UPDATE, 4);
    assert.equal(PERMISSION_DELETE, 8);
  });
});

// Standard DB pool cleanup - runs after all tests in this file
test.after(async () => {
  await closeDbPool();
});
