import { MantineProvider, TextInput } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReviewPanel, getReviewSectionStatus, shouldRenderReviewPanel } from "@/components/ReviewPanel";
import { canSubmitReviewPanel } from "@/components/ReviewPanel/ReviewPanel";
import { diffValues } from "@/lib/diff-engine";

function renderPanel(overrides: Partial<Parameters<typeof ReviewPanel>[0]> = {}): string {
  const changes = diffValues(
    { amount: "10.00", supplier: "Old" },
    { amount: "15000.25", supplier: "New" },
    { moneyFields: ["amount"] },
  );
  return renderToStaticMarkup(createElement(
    MantineProvider,
    {},
    createElement(ReviewPanel, {
      title: "Review AP invoice",
      description: "Review before posting financial changes.",
      sections: [
        {
          id: "header",
          title: "Header",
          description: "Supplier and invoice metadata",
          content: createElement(TextInput, { label: "Supplier", value: "New", readOnly: true }),
        },
        {
          id: "lines",
          title: "Lines",
          content: createElement("div", {}, "Line items"),
          errors: overrides.sections?.[1]?.errors,
        },
      ],
      summaryItems: [{ label: "Entity", value: "AP invoice draft" }],
      scopeBadges: [{ label: "Company", value: "10" }, { label: "Outlet", value: "30" }],
      diffChanges: changes,
      highValueThreshold: 10000,
      onSubmit: () => undefined,
      ...overrides,
    }),
  ));
}

describe("ReviewPanel", () => {
  it("renders sectioned layout with accessible completion badges and final review", () => {
    const html = renderPanel();

    expect(html).toContain("Review AP invoice");
    expect(html).toContain("Header section status: In progress");
    expect(html).toContain("Lines section status: Incomplete");
    expect(html).toContain("aria-expanded=\"true\"");
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).toContain("Final review");
    expect(html).toContain("I confirm this action is correct and authorized");
    expect(html).toContain("Save and log change");
  });

  it("requires completed sections and final checkbox confirmation before submit is enabled", () => {
    expect(canSubmitReviewPanel({ allSectionsComplete: true, confirmed: true })).toBe(true);
    expect(canSubmitReviewPanel({ allSectionsComplete: false, confirmed: true })).toBe(false);
    expect(canSubmitReviewPanel({ allSectionsComplete: true, confirmed: false })).toBe(false);
    expect(canSubmitReviewPanel({ allSectionsComplete: true, confirmed: true, saveDisabled: true })).toBe(false);
    expect(canSubmitReviewPanel({ allSectionsComplete: true, confirmed: true, submitting: true })).toBe(false);
  });

  it("shows before/after money diff with cents and high-value warning", () => {
    const html = renderPanel();

    expect(html).toContain("10.00");
    expect(html).toContain("15000.25");
    expect(html).toContain("High-value monetary delta detected");
  });

  it("announces invalid sections and prevents invalid status from appearing complete", () => {
    const html = renderPanel({ sections: [{ id: "ignored", title: "ignored", content: "ignored" }, { id: "lines", title: "Lines", content: "Line items", errors: ["Amount cannot be negative."] }] });

    expect(html).toContain("role=\"alert\"");
    expect(html).toContain("Resolve validation errors before final submission.");
    expect(html).toContain("Lines section status: Invalid");
    expect(html).toContain("Amount cannot be negative.");
  });

  it("exposes feature flag behavior for shadow and enabled rollout modes", () => {
    expect(shouldRenderReviewPanel({ mode: "off" })).toBe(false);
    expect(shouldRenderReviewPanel({ mode: "shadow", isDevelopmentRoute: false })).toBe(false);
    expect(shouldRenderReviewPanel({ mode: "shadow", isDevelopmentRoute: true })).toBe(true);
    expect(shouldRenderReviewPanel({ mode: "10" })).toBe(true);
    expect(renderPanel({ featureFlag: { mode: "shadow", isDevelopmentRoute: false } })).not.toContain("Review AP invoice");
  });

  it("models completion state as incomplete, in-progress, complete, and invalid", () => {
    expect(getReviewSectionStatus({ active: false, complete: false })).toBe("incomplete");
    expect(getReviewSectionStatus({ active: true, complete: false })).toBe("in-progress");
    expect(getReviewSectionStatus({ active: false, complete: true })).toBe("complete");
    expect(getReviewSectionStatus({ active: false, complete: true, errors: ["Invalid"] })).toBe("invalid");
  });

  it("renders confirmation dialog with accessible labels when unsaved guard blocks navigation", () => {
    const html = renderPanel({ unsavedDialogOpened: true });

    expect(html).toContain("Unsaved changes confirmation dialog");
    expect(html).toContain("Stay");
    expect(html).toContain("Leave");
  });

  it("renders local autosave warnings without blocking submit availability", () => {
    const html = renderPanel({ autosaveWarning: "Draft autosave is unavailable." });

    expect(html).toContain("Draft autosave warning");
    expect(html).toContain("Submit remains available.");
  });
});
