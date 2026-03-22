// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Playwright Component Test setup file
// This file is loaded before each component test

import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import { MantineProvider } from "@mantine/core";

import "@mantine/core/styles.css";

// Wrap component with MantineProvider before mounting
beforeMount(async ({ App }) => {
  const WrappedApp = () => (
    <MantineProvider>
      <App />
    </MantineProvider>
  );
  return <WrappedApp />;
});
