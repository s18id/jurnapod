// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Vitest workspace — coordinates all package configs in a single process
// to avoid spawning N independent vitest daemons that exhaust memory.
export default [
  'packages/*/vitest.config.ts',
  'apps/*/vitest.config.ts',
];