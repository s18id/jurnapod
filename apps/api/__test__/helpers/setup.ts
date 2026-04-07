// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Test HTTP Client - Connects to external test server
// 
// Usage (no server management needed):
// ```typescript
// import { getTestBaseUrl } from './helpers/env';
// 
// it('makes HTTP request', async () => {
//   const res = await fetch(`${getTestBaseUrl()}/api/health`);
//   expect(res.ok).toBe(true);
// });
// ```
//
// No setup/teardown needed when using external test server.

import { getTestBaseUrl } from './env';

// Re-export for convenience
export { getTestBaseUrl };
