// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test, expect } from "@playwright/experimental-ct-react";

test.describe("Simple Component", () => {
  test("renders simple text", async ({ mount }) => {
    const component = await mount(<div>Hello World</div>);
    await expect(component).toContainText("Hello World");
  });
});
