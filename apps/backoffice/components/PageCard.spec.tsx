// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test, expect } from "@playwright/experimental-ct-react";

import { PageCard } from "../src/components/PageCard";

test.describe("PageCard Component", () => {
  test("renders with title", async ({ mount }) => {
    const component = await mount(
      <PageCard title="Test Title">
        <div>Content</div>
      </PageCard>
    );
    
    // Check the component is rendered
    await expect(component).toBeVisible();
    // Check title is rendered using text content
    await expect(component).toContainText("Test Title");
  });

  test("renders with title and description", async ({ mount }) => {
    const component = await mount(
      <PageCard title="Test Title" description="Test description">
        <div>Content</div>
      </PageCard>
    );
    
    await expect(component).toContainText("Test description");
  });

  test("renders actions slot", async ({ mount }) => {
    const component = await mount(
      <PageCard 
        title="Test Title" 
        actions={<button>Action Button</button>}
      >
        <div>Content</div>
      </PageCard>
    );
    
    await expect(component.getByRole("button", { name: "Action Button" })).toBeVisible();
  });

  test("renders children content", async ({ mount }) => {
    const component = await mount(
      <PageCard>
        <p>Children content here</p>
      </PageCard>
    );
    
    await expect(component).toContainText("Children content here");
  });
});
