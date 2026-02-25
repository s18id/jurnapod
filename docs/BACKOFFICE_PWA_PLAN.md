# Backoffice PWA Implementation Plan

**Project:** Jurnapod Backoffice  
**Goal:** Hybrid PWA - Offline-capable but not fully offline  
**Effort:** 3-4 days (28 hours)  
**Date:** 2024-02-25

---

## Executive Summary

Transform the backoffice into a **Smart Hybrid PWA** that:
- ✅ **CAN work offline** for critical transaction input
- ⚠️ **NOT meant** for extended offline work
- 🔄 **Syncs automatically** when connection returns
- 📊 **Reports require connection** (real-time data)

**Use Case:** Accountants/admins who sometimes work on mobile devices with poor connectivity, need to input transactions, but usually have stable internet.

---

## Table of Contents

1. [Philosophy & Approach](#philosophy--approach)
2. [What Works Offline vs Online-Only](#what-works-offline-vs-online-only)
3. [Architecture Design](#architecture-design)
4. [User Experience Flows](#user-experience-flows)
5. [Sync Strategy](#sync-strategy)
6. [Conflict Resolution](#conflict-resolution)
7. [Data Caching Strategy](#data-caching-strategy)
8. [Visual Indicators](#visual-indicators)
9. [Implementation Phases](#implementation-phases)
10. [Tech Stack](#tech-stack)
11. [Storage Estimation](#storage-estimation)
12. [Scope Boundaries](#scope-boundaries)

---

## Philosophy & Approach

### Core Principles

1. **Progressive Enhancement**
   - Works perfectly online (default)
   - Gracefully degrades offline
   - Enhances back when online

2. **Selective Offline Capability**
   - Only critical operations work offline
   - Most features require connection
   - Clear user communication

3. **Automatic Recovery**
   - Auto-sync when possible
   - Manual override available
   - No silent failures

4. **Data Integrity**
   - Server is source of truth
   - No automatic overwrites
   - User resolves conflicts

---

## What Works Offline vs Online-Only

### ✅ Offline-Capable Features

#### 1. Transaction Input (Critical)
- **Manual journal entries**
  - Expense recording
  - Cash/bank transfers
  - Adjusting entries
- **Sales invoices** (if needed)
- **Sales payments** (if needed)

**Why:** Can't lose transaction data during poor connection. These are time-sensitive business operations.

#### 2. Master Data (Read-only Cache)
- **Chart of Accounts** - Reference for account selection
- **Account Types** - Dropdown data
- **Items/Prices** - For invoice creation

**Why:** Required to fill forms offline. Cached data is read-only to prevent conflicts.

#### 3. Form Drafts (Auto-save)
- **Incomplete forms** saved locally
- **Resume later** capability

**Why:** Don't lose work if connection drops unexpectedly.

### ❌ Requires Connection

#### 1. All Reports (Real-time Data)
- Trial Balance
- Profit & Loss Statement
- Journals list
- Daily Sales
- General Ledger
- Any financial reports

**Why:** Reports must be current with multi-user data. Stale financial reports are dangerous for business decisions.

#### 2. View Historical Data
- Past transaction lists
- Account history
- Search results
- Audit logs

**Why:** Too much data to cache. Needs to be fresh and comprehensive.

#### 3. Master Data Changes
- Create/Edit Accounts
- Create/Edit Account Types
- Create/Edit Items/Prices
- User management

**Why:** Multi-user conflict risk. Requires immediate server validation and consistency checks.

---

## Architecture Design

### High-Level Flow

```
┌─────────────────────────────────────────────────────────┐
│                    BACKOFFICE PWA                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🟢 Online Mode (Default - 90% of time):              │
│     └─> Direct API calls                               │
│     └─> Real-time data                                 │
│     └─> All features available                         │
│                                                         │
│  🟡 Poor Connection Detected:                          │
│     └─> Switch to Offline Mode                         │
│     └─> Show warning banner                            │
│     └─> Enable offline capabilities                    │
│                                                         │
│  🔴 Offline Mode (Temporary - 10% of time):           │
│     ├─> Transaction Input → IndexedDB outbox           │
│     ├─> Read master data from cache                    │
│     ├─> Form drafts auto-save                          │
│     └─> Reports show "Connect required" message        │
│                                                         │
│  🟢 Connection Returns:                                │
│     └─> Auto-sync queued transactions                  │
│     └─> Refresh master data cache                      │
│     └─> Clear offline indicators                       │
│     └─> Resume normal operations                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### IndexedDB Schema

```typescript
// Database: jurnapod_backoffice
// Version: 1

// Store 1: Outbox (Transaction Queue)
interface Outbox {
  id: string;              // UUID v4
  type: 'journal' | 'invoice' | 'payment';
  payload: object;         // Full transaction data
  timestamp: Date;         // When created
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;      // Number of sync attempts (max 3)
  error?: string;          // Last error message
  userId: number;          // Who created it
}

// Store 2: Master Data Cache (Read-only)
interface MasterDataCache {
  type: 'accounts' | 'account_types' | 'items';
  data: Array<any>;        // Full dataset
  lastSync: Date;          // When fetched
  expiresAt: Date;         // TTL (24 hours)
  version: number;         // For cache invalidation
}

// Store 3: Form Drafts (Auto-save)
interface FormDrafts {
  id: string;              // Form identifier
  formType: 'journal' | 'invoice' | 'payment';
  data: object;            // Form state
  savedAt: Date;           // Auto-save timestamp
  userId: number;          // Who is editing
}

// Store 4: Sync History (Audit trail)
interface SyncHistory {
  id: string;
  action: 'sync_success' | 'sync_failed' | 'manual_sync';
  timestamp: Date;
  itemCount: number;
  details: string;
}
```

### Cache Strategy (Service Worker)

```typescript
// Static Assets (Cache-First)
// CSS, JS, images, fonts
Strategy: CacheFirst
Cache: 'static-v1'
Max Age: 30 days
Max Entries: 100

// API Calls - Master Data (Network-First)
// /api/accounts, /api/account-types, /api/items
Strategy: NetworkFirst
Fallback: Cache
Cache: 'api-master-v1'
Max Age: 24 hours
Max Entries: 50

// API Calls - Transaction Input (Network-Only)
// /api/journals (POST), /api/invoices (POST)
Strategy: NetworkOnly (no cache)
Fallback: Save to outbox

// API Calls - Reports (Network-Only)
// /api/reports/*
Strategy: NetworkOnly
Fallback: Show "Connect required" message
```

---

## User Experience Flows

### Scenario 1: Good Connection (Default - 90% of time)

```
1. User opens backoffice
   └─> Loads from cache instantly (PWA benefit)
   └─> Shows "🟢 Online" indicator

2. User navigates to Transaction Input
   └─> Form loads immediately
   └─> Dropdowns fetch from API (fast)
   └─> All features available

3. User submits transaction
   └─> POST to API → Success (201)
   └─> Shows success message
   └─> Clears form

4. User views reports
   └─> Fetches real-time data
   └─> Displays charts/tables
   └─> All features work

Result: Normal web app experience, but faster (cached assets)
```

### Scenario 2: Poor/No Connection (Occasional - 10% of time)

```
1. User opens backoffice
   └─> App detects no connection
   └─> Shows banner:
       ╔═══════════════════════════════════════════╗
       ║ 🔴 OFFLINE MODE                           ║
       ║ You can enter transactions. They will     ║
       ║ sync automatically when connection        ║
       ║ returns.                                  ║
       ║ [View Queue (0)] [Dismiss]                ║
       ╚═══════════════════════════════════════════╝

2. User goes to Transaction Input page
   ✅ Form works normally
   ✅ Dropdowns use cached accounts (from yesterday)
   ✅ All validations work client-side
   ✅ Shows warning: "Using cached account list (synced 2h ago)"

3. User fills form and submits
   ✅ Validates locally (required fields, balance check)
   ✅ Saves to IndexedDB outbox
   ✅ Shows feedback:
       "✅ Transaction saved to queue
        Will sync automatically when online"
   ✅ Badge updates: "🔴 Offline (1 pending)"

4. User tries to view Reports
   ⚠️ Shows message:
       ┌────────────────────────────────────┐
       │ ⚠️  Connect to View Reports        │
       │                                    │
       │ Reports require real-time data.    │
       │ Please connect to the internet     │
       │ to view financial reports.         │
       │                                    │
       │ [Retry Connection]                 │
       └────────────────────────────────────┘

5. User tries to edit Chart of Accounts
   ⚠️ Shows message:
       "⚠️ Viewing cached accounts. Connect to make changes."
   ⚠️ Edit/Create buttons disabled

Result: Critical work continues, non-critical features disabled
```

### Scenario 3: Connection Returns

```
1. App detects connection restored
   └─> Shows notification:
       "🟡 Connection restored! Syncing 3 transactions..."

2. Auto-sync process starts
   ├─> Transaction 1: POST /api/journals
   │   └─> Success (201) ✅ Removed from queue
   │
   ├─> Transaction 2: POST /api/journals
   │   └─> Success (201) ✅ Removed from queue
   │
   └─> Transaction 3: POST /api/journals
       └─> Conflict (409) ⚠️ Flagged for review
           Account was deactivated while offline

3. Shows sync summary:
   ╔═══════════════════════════════════════════╗
   ║ ✅ Sync Complete                          ║
   ║                                           ║
   ║ Synced: 2 transactions                    ║
   ║ Conflicts: 1 transaction needs review    ║
   ║                                           ║
   ║ [View Conflicts] [Dismiss]                ║
   ╚═══════════════════════════════════════════╝

4. User clicks "View Conflicts"
   └─> Shows conflict resolution UI:
       ┌─────────────────────────────────────────┐
       │ Transaction needs your attention:       │
       │                                         │
       │ Journal Entry - Office Supplies         │
       │ Date: 2024-02-25                        │
       │ Amount: 500.00                          │
       │                                         │
       │ ⚠️ Problem: Account "Office Supplies"   │
       │    was deactivated while you were       │
       │    offline.                             │
       │                                         │
       │ Choose an action:                       │
       │ • [Select Different Account]            │
       │ • [Discard Transaction]                 │
       │ • [Keep in Queue]                       │
       └─────────────────────────────────────────┘

5. Master data refreshes
   └─> Fetches latest accounts, types, items
   └─> Updates cache with fresh data

6. Banner changes to:
   "🟢 Online - All systems normal"

Result: Seamless recovery, conflicts handled gracefully
```

---

## Sync Strategy

### Auto-Sync Behavior (Recommended)

#### When Connection Detected

```typescript
async function autoSync() {
  // 1. Check if there are pending items
  const pending = await outbox.where('status').equals('pending').toArray();
  
  if (pending.length === 0) {
    return; // Nothing to sync
  }

  // 2. Show sync indicator
  showSyncBanner(`Syncing ${pending.length} transactions...`);

  // 3. Process each transaction sequentially
  for (const item of pending) {
    try {
      // Update status
      await outbox.update(item.id, { status: 'syncing' });

      // Attempt to sync
      const response = await syncTransaction(item);

      if (response.ok) {
        // Success - remove from queue
        await outbox.delete(item.id);
        await syncHistory.add({
          id: uuid(),
          action: 'sync_success',
          timestamp: new Date(),
          itemCount: 1,
          details: `${item.type} #${item.id}`
        });
      } else if (response.status === 409) {
        // Conflict - flag for user review
        await outbox.update(item.id, {
          status: 'failed',
          error: 'Conflict - needs review'
        });
      } else if (response.status >= 400 && response.status < 500) {
        // Client error - permanent failure
        await outbox.update(item.id, {
          status: 'failed',
          error: await response.text()
        });
      } else {
        // Server error - retry later
        const retryCount = item.retryCount + 1;
        if (retryCount >= 3) {
          // Max retries reached
          await outbox.update(item.id, {
            status: 'failed',
            error: 'Max retries reached',
            retryCount
          });
        } else {
          // Will retry
          await outbox.update(item.id, {
            status: 'pending',
            retryCount
          });
        }
      }
    } catch (error) {
      // Network error - keep pending
      await outbox.update(item.id, { status: 'pending' });
    }
  }

  // 4. Show summary
  const successful = pending.length - await outbox.count();
  const failed = await outbox.where('status').equals('failed').count();
  
  showSyncSummary(successful, failed);
}
```

#### Background Sync

```typescript
// Check connection every 30 seconds
setInterval(async () => {
  if (navigator.onLine && await testConnection()) {
    await autoSync();
  }
}, 30000);

// Also sync on:
// - Page load (if online)
// - Visibility change (tab becomes active)
// - Online event (connection restored)
window.addEventListener('online', autoSync);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) autoSync();
});
```

### Manual Sync Option

```typescript
// UI Component
function SyncQueuePanel() {
  const [queue, setQueue] = useState([]);
  
  async function loadQueue() {
    const items = await outbox.toArray();
    setQueue(items);
  }

  async function manualSync() {
    showLoading('Syncing...');
    await autoSync();
    await loadQueue();
    hideLoading();
  }

  async function editItem(id) {
    // Load item, show form, allow editing
    const item = await outbox.get(id);
    showEditDialog(item);
  }

  async function deleteItem(id) {
    if (confirm('Discard this transaction?')) {
      await outbox.delete(id);
      await loadQueue();
    }
  }

  return (
    <div className="sync-queue-panel">
      <h3>Pending Transactions ({queue.length})</h3>
      
      {queue.map(item => (
        <div key={item.id} className="queue-item">
          <div>
            <strong>{item.type}</strong>
            <span>{new Date(item.timestamp).toLocaleString()}</span>
          </div>
          <div>
            Status: {item.status}
            {item.error && <span className="error">{item.error}</span>}
          </div>
          <div className="actions">
            <button onClick={() => editItem(item.id)}>Edit</button>
            <button onClick={() => deleteItem(item.id)}>Delete</button>
          </div>
        </div>
      ))}

      <button onClick={manualSync} disabled={queue.length === 0}>
        Sync All Now
      </button>
    </div>
  );
}
```

---

## Conflict Resolution

### Strategy: Server Validation + User Choice

**Philosophy:** No automatic overwrites. User always makes final decision.

### Server-Side Validation

```typescript
// API endpoint: POST /api/journals
async function createJournalEntry(req, res) {
  const { lines, entry_date, description } = req.body;

  // Validation checks
  const validations = [
    { check: validateBalance(lines), error: 'Entry not balanced' },
    { check: await validateAccounts(lines), error: 'Invalid accounts' },
    { check: validateDate(entry_date), error: 'Invalid date' },
    { check: validatePermissions(req.user), error: 'Insufficient permissions' }
  ];

  for (const validation of validations) {
    if (!validation.check) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error
        }
      });
    }
  }

  // Check for conflicts
  const conflicts = await checkConflicts(lines);
  if (conflicts.length > 0) {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'Data changed while offline',
        conflicts: conflicts
      }
    });
  }

  // All good - create entry
  const entry = await createEntry(req.body);
  return res.status(201).json({ success: true, data: entry });
}

async function validateAccounts(lines) {
  for (const line of lines) {
    const account = await db.query(
      'SELECT id, is_active FROM accounts WHERE id = ? AND company_id = ?',
      [line.account_id, req.user.company_id]
    );
    
    if (account.length === 0) {
      return { valid: false, error: `Account ${line.account_id} not found` };
    }
    
    if (!account[0].is_active) {
      return { 
        valid: false, 
        error: `Account "${account[0].name}" was deactivated`,
        accountId: line.account_id
      };
    }
  }
  
  return { valid: true };
}
```

### Client-Side Conflict Handling

```typescript
async function syncTransaction(item) {
  const response = await fetch('/api/journals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item.payload)
  });

  if (response.status === 409) {
    // Conflict detected
    const conflict = await response.json();
    
    // Show user-friendly conflict resolution
    showConflictDialog({
      transaction: item,
      conflict: conflict.error,
      onResolve: async (resolution) => {
        if (resolution.action === 'edit') {
          // Allow user to edit and resubmit
          await editAndRetry(item, resolution.changes);
        } else if (resolution.action === 'discard') {
          // Remove from queue
          await outbox.delete(item.id);
        } else if (resolution.action === 'keep') {
          // Keep in queue for manual resolution later
          await outbox.update(item.id, { 
            status: 'failed',
            error: conflict.error.message 
          });
        }
      }
    });
  }

  return response;
}
```

### Conflict Resolution UI

```typescript
function ConflictDialog({ transaction, conflict, onResolve }) {
  return (
    <Dialog>
      <DialogTitle>Transaction Needs Attention</DialogTitle>
      
      <DialogContent>
        <Alert severity="warning">
          {conflict.message}
        </Alert>

        <Box mt={2}>
          <Typography variant="subtitle2">Transaction Details:</Typography>
          <Typography>Type: {transaction.type}</Typography>
          <Typography>Date: {transaction.payload.entry_date}</Typography>
          <Typography>Description: {transaction.payload.description}</Typography>
        </Box>

        {conflict.conflicts?.map(c => (
          <Box mt={2} key={c.accountId}>
            <Typography color="error">
              Issue: Account {c.accountId} - {c.error}
            </Typography>
          </Box>
        ))}
      </DialogContent>

      <DialogActions>
        <Button onClick={() => onResolve({ action: 'edit' })}>
          Edit Transaction
        </Button>
        <Button onClick={() => onResolve({ action: 'keep' })}>
          Keep in Queue
        </Button>
        <Button onClick={() => onResolve({ action: 'discard' })} color="error">
          Discard
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

---

## Data Caching Strategy

### Master Data Cache Policy

```typescript
const CACHE_POLICIES = {
  accounts: {
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    endpoint: '/api/accounts',
    filter: { is_active: true },
    estimatedSize: 10, // KB
    priority: 'high'
  },
  
  accountTypes: {
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    endpoint: '/api/account-types',
    filter: { is_active: true },
    estimatedSize: 2, // KB
    priority: 'high'
  },
  
  items: {
    ttl: 12 * 60 * 60 * 1000, // 12 hours
    endpoint: '/api/items',
    filter: { is_active: true },
    estimatedSize: 20, // KB
    priority: 'medium'
  }
};
```

### Cache Refresh Logic

```typescript
async function refreshMasterDataCache() {
  for (const [type, policy] of Object.entries(CACHE_POLICIES)) {
    try {
      // Check if cache is stale
      const cached = await masterDataCache.get(type);
      
      if (!cached || new Date() > new Date(cached.expiresAt)) {
        console.log(`Refreshing ${type} cache...`);
        
        // Fetch fresh data
        const response = await fetch(policy.endpoint, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          const { data } = await response.json();
          
          // Update cache
          await masterDataCache.put({
            type,
            data,
            lastSync: new Date(),
            expiresAt: new Date(Date.now() + policy.ttl),
            version: (cached?.version || 0) + 1
          });
          
          console.log(`✅ ${type} cache updated (${data.length} items)`);
        }
      } else {
        console.log(`✓ ${type} cache still fresh`);
      }
    } catch (error) {
      console.error(`Failed to refresh ${type} cache:`, error);
      // Continue with stale cache if available
    }
  }
}

// Refresh on:
// 1. App startup
window.addEventListener('load', refreshMasterDataCache);

// 2. When coming back online
window.addEventListener('online', refreshMasterDataCache);

// 3. Daily (for long-running tabs)
setInterval(refreshMasterDataCache, 24 * 60 * 60 * 1000);
```

### Transaction History Cache (Optional)

```typescript
// Optional: Cache recent transactions for reference
const TRANSACTION_CACHE_POLICY = {
  enabled: false, // Can be enabled later if needed
  
  recent_journals: {
    ttl: 60 * 60 * 1000, // 1 hour (short TTL - frequently changes)
    endpoint: '/api/journals',
    filter: { 
      start_date: '7_days_ago',
      limit: 100 
    },
    estimatedSize: 50, // KB
    priority: 'low',
    readOnly: true,
    showStaleWarning: true
  }
};

// Note: This is optional. Start without it to keep things simple.
// Can add later if users request "view recent entries while offline"
```

---

## Visual Indicators

### 1. Connection Status Badge (Top-Right Corner)

```typescript
function ConnectionStatus() {
  const [status, setStatus] = useState('online');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Monitor connection
    const checkStatus = async () => {
      if (!navigator.onLine) {
        setStatus('offline');
      } else {
        try {
          await fetch('/api/health', { method: 'HEAD' });
          setStatus('online');
        } catch {
          setStatus('offline');
        }
      }
      
      // Count pending items
      const count = await outbox.where('status').equals('pending').count();
      setPendingCount(count);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 10000); // Every 10s
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`connection-badge ${status}`}>
      {status === 'online' && '🟢 Online'}
      {status === 'offline' && `🔴 Offline ${pendingCount > 0 ? `(${pendingCount} pending)` : ''}`}
      {status === 'syncing' && '🟡 Syncing...'}
    </div>
  );
}
```

**CSS:**
```css
.connection-badge {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  z-index: 9999;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.connection-badge.online {
  background: #d4edda;
  color: #155724;
}

.connection-badge.offline {
  background: #f8d7da;
  color: #721c24;
}

.connection-badge.syncing {
  background: #fff3cd;
  color: #856404;
}
```

### 2. Offline Mode Banner (Full-Width, Dismissible)

```typescript
function OfflineBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const check = async () => {
      const offline = !navigator.onLine;
      setIsOffline(offline);
      
      if (offline) {
        const count = await outbox.where('status').equals('pending').count();
        setPendingCount(count);
      }
    };
    
    check();
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    
    return () => {
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
    };
  }, []);

  if (!isOffline || dismissed) return null;

  return (
    <div className="offline-banner">
      <div className="offline-banner-content">
        <div className="offline-banner-icon">🔴</div>
        <div className="offline-banner-text">
          <strong>OFFLINE MODE</strong>
          <p>You can continue entering transactions. Changes will sync automatically when online.</p>
        </div>
        <div className="offline-banner-actions">
          <button onClick={() => window.location.hash = '#/queue'}>
            View Queue ({pendingCount})
          </button>
          <button onClick={() => setDismissed(true)}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
```

**CSS:**
```css
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #f8d7da;
  border-bottom: 2px solid #f5c6cb;
  padding: 16px;
  z-index: 9998;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.offline-banner-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.offline-banner-icon {
  font-size: 24px;
}

.offline-banner-text {
  flex: 1;
}

.offline-banner-text strong {
  color: #721c24;
  font-size: 16px;
  display: block;
  margin-bottom: 4px;
}

.offline-banner-text p {
  color: #721c24;
  font-size: 14px;
  margin: 0;
}

.offline-banner-actions {
  display: flex;
  gap: 8px;
}

.offline-banner-actions button {
  padding: 8px 16px;
  border: 1px solid #721c24;
  border-radius: 6px;
  background: white;
  color: #721c24;
  cursor: pointer;
  font-size: 14px;
}

.offline-banner-actions button:hover {
  background: #f5f5f5;
}
```

### 3. Form Save Feedback

```typescript
function SaveFeedback({ status, message }) {
  if (!message) return null;

  return (
    <div className={`save-feedback ${status}`}>
      {status === 'success' && '✅'}
      {status === 'queued' && '⏳'}
      {status === 'error' && '❌'}
      <span>{message}</span>
    </div>
  );
}

// Usage in form:
function TransactionForm() {
  const [feedback, setFeedback] = useState(null);

  async function handleSubmit() {
    const isOnline = navigator.onLine;

    if (isOnline) {
      // Normal save
      await saveToAPI();
      setFeedback({ 
        status: 'success', 
        message: 'Transaction saved successfully' 
      });
    } else {
      // Offline save
      await saveToOutbox();
      setFeedback({ 
        status: 'queued', 
        message: 'Transaction saved to queue. Will sync when online.' 
      });
    }

    setTimeout(() => setFeedback(null), 5000);
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <SaveFeedback {...feedback} />
    </form>
  );
}
```

### 4. Page-Level Warnings (Reports/Master Data)

```typescript
function ReportsPage() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handler = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, []);

  if (isOffline) {
    return (
      <div className="page-warning">
        <div className="page-warning-icon">⚠️</div>
        <h2>Connect to View Reports</h2>
        <p>Reports require real-time data. Please connect to the internet to view financial reports.</p>
        <button onClick={() => window.location.reload()}>
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Normal reports UI */}
    </div>
  );
}
```

### 5. Stale Data Warning

```typescript
function MasterDataList({ data, lastSync }) {
  const isStale = Date.now() - new Date(lastSync).getTime() > 24 * 60 * 60 * 1000;

  return (
    <div>
      {isStale && (
        <div className="stale-data-warning">
          ⚠️ Viewing cached data (last synced {formatRelativeTime(lastSync)}).
          Connect to see latest changes.
        </div>
      )}
      
      {/* Data display */}
    </div>
  );
}
```

---

## Implementation Phases

### Phase 1: Basic PWA Setup (Day 1 - 4 hours)

**Goal:** Make backoffice installable and cache static assets

#### Tasks:
1. Install dependencies
   ```bash
   npm install vite-plugin-pwa -D
   npm install dexie
   ```

2. Configure Vite PWA
   ```typescript
   // vite.config.ts
   import { VitePWA } from 'vite-plugin-pwa';

   export default defineConfig({
     plugins: [
       react(),
       VitePWA({
         registerType: 'autoUpdate',
         includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
         manifest: {
           name: 'Jurnapod Backoffice',
           short_name: 'Jurnapod',
           description: 'Modular ERP Backoffice',
           theme_color: '#2f5f4a',
           background_color: '#fcfbf8',
           display: 'standalone',
           orientation: 'any',
           icons: [
             {
               src: 'icons/icon-192x192.png',
               sizes: '192x192',
               type: 'image/png'
             },
             {
               src: 'icons/icon-512x512.png',
               sizes: '512x512',
               type: 'image/png'
             }
           ]
         },
         workbox: {
           runtimeCaching: [
             {
               urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif)$/,
               handler: 'CacheFirst',
               options: {
                 cacheName: 'images',
                 expiration: {
                   maxEntries: 50,
                   maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
                 }
               }
             }
           ]
         }
       })
     ]
   });
   ```

3. Create PWA icons
   - 192x192 icon
   - 512x512 icon
   - Favicon

4. Add online/offline detection
   ```typescript
   // src/lib/connection.ts
   export function useOnlineStatus() {
     const [isOnline, setIsOnline] = useState(navigator.onLine);

     useEffect(() => {
       const handleOnline = () => setIsOnline(true);
       const handleOffline = () => setIsOnline(false);

       window.addEventListener('online', handleOnline);
       window.addEventListener('offline', handleOffline);

       return () => {
         window.removeEventListener('online', handleOnline);
         window.removeEventListener('offline', handleOffline);
       };
     }, []);

     return isOnline;
   }
   ```

5. Add ConnectionStatus component to layout

**Result:** 
- ✅ Installable app (Add to Home Screen)
- ✅ Fast loading (cached assets)
- ✅ Online/offline indicator
- ✅ Works as PWA on mobile

---

### Phase 2: IndexedDB & Master Data Cache (Day 1-2 - 6 hours)

**Goal:** Cache master data for offline form usage

#### Tasks:
1. Setup Dexie schema
   ```typescript
   // src/lib/offline-db.ts
   import Dexie, { Table } from 'dexie';

   interface Outbox {
     id: string;
     type: 'journal' | 'invoice' | 'payment';
     payload: any;
     timestamp: Date;
     status: 'pending' | 'syncing' | 'failed';
     retryCount: number;
     error?: string;
     userId: number;
   }

   interface MasterDataCache {
     type: string;
     data: any[];
     lastSync: Date;
     expiresAt: Date;
     version: number;
   }

   interface FormDraft {
     id: string;
     formType: string;
     data: any;
     savedAt: Date;
     userId: number;
   }

   class OfflineDatabase extends Dexie {
     outbox!: Table<Outbox>;
     masterDataCache!: Table<MasterDataCache>;
     formDrafts!: Table<FormDraft>;

     constructor() {
       super('jurnapod_backoffice');
       this.version(1).stores({
         outbox: 'id, status, timestamp, userId',
         masterDataCache: 'type, expiresAt',
         formDrafts: 'id, formType, userId'
       });
     }
   }

   export const db = new OfflineDatabase();
   ```

2. Create cache service
   ```typescript
   // src/lib/cache-service.ts
   export class CacheService {
     static async getCachedAccounts(companyId: number): Promise<AccountResponse[]> {
       const cached = await db.masterDataCache.get('accounts');
       
       if (!cached || new Date() > new Date(cached.expiresAt)) {
         return this.refreshAccounts(companyId);
       }
       
       return cached.data;
     }

     static async refreshAccounts(companyId: number): Promise<AccountResponse[]> {
       const response = await fetch(`/api/accounts?company_id=${companyId}`);
       const { data } = await response.json();
       
       await db.masterDataCache.put({
         type: 'accounts',
         data,
         lastSync: new Date(),
         expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
         version: 1
       });
       
       return data;
     }

     // Similar for account types and items
   }
   ```

3. Update hooks to use cache when offline
   ```typescript
   // src/hooks/use-accounts.ts
   export function useAccounts(companyId: number, accessToken: string) {
     const isOnline = useOnlineStatus();
     
     const refetch = useCallback(async () => {
       setLoading(true);
       try {
         if (isOnline) {
           // Online - fetch from API
           const response = await apiRequest(...);
           setData(response.data);
           // Also update cache
           await CacheService.cacheAccounts(response.data);
         } else {
           // Offline - use cache
           const cached = await CacheService.getCachedAccounts(companyId);
           setData(cached);
         }
       } catch (error) {
         setError(error.message);
       } finally {
         setLoading(false);
       }
     }, [isOnline, companyId]);
   }
   ```

4. Add cache refresh logic
   - On app startup
   - When coming back online
   - Every 24 hours

5. Add stale data indicator to UI

**Result:**
- ✅ Master data cached in IndexedDB
- ✅ Forms work offline (dropdowns use cache)
- ✅ Automatic cache refresh
- ✅ Stale data warnings

---

### Phase 3: Offline Transaction Input (Day 2-3 - 8 hours)

**Goal:** Allow transaction input to work offline

#### Tasks:
1. Create outbox service
   ```typescript
   // src/lib/outbox-service.ts
   export class OutboxService {
     static async queueTransaction(
       type: 'journal' | 'invoice',
       payload: any,
       userId: number
     ): Promise<string> {
       const id = crypto.randomUUID();
       
       await db.outbox.add({
         id,
         type,
         payload,
         timestamp: new Date(),
         status: 'pending',
         retryCount: 0,
         userId
       });
       
       return id;
     }

     static async getPendingCount(): Promise<number> {
       return db.outbox.where('status').equals('pending').count();
     }

     static async getAllPending(): Promise<Outbox[]> {
       return db.outbox.where('status').equals('pending').toArray();
     }
   }
   ```

2. Modify transaction form to use outbox when offline
   ```typescript
   // src/features/transactions-page.tsx
   async function handleSubmit(e: React.FormEvent) {
     e.preventDefault();
     
     setSubmitting(true);
     setSubmitError(null);

     try {
       if (navigator.onLine) {
         // Online - normal save
         await createManualJournalEntry(data, accessToken);
         setSubmitSuccess(true);
       } else {
         // Offline - save to outbox
         await OutboxService.queueTransaction(
           'journal',
           data,
           user.id
         );
         setSubmitSuccess(true);
         setFeedbackMessage('Transaction queued. Will sync when online.');
       }
       
       clearForm();
     } catch (err) {
       setSubmitError(err.message);
     } finally {
       setSubmitting(false);
     }
   }
   ```

3. Add visual feedback for queued items
   - Badge showing count
   - Different success message
   - Queue icon in form

4. Create sync queue view page
   ```typescript
   // src/features/sync-queue-page.tsx
   export function SyncQueuePage() {
     const [queue, setQueue] = useState<Outbox[]>([]);

     async function loadQueue() {
       const items = await db.outbox.toArray();
       setQueue(items);
     }

     async function deleteItem(id: string) {
       if (confirm('Discard this transaction?')) {
         await db.outbox.delete(id);
         await loadQueue();
       }
     }

     return (
       <div>
         <h1>Sync Queue</h1>
         {queue.map(item => (
           <div key={item.id}>
             <div>{item.type} - {item.status}</div>
             <div>{new Date(item.timestamp).toLocaleString()}</div>
             {item.error && <div className="error">{item.error}</div>}
             <button onClick={() => deleteItem(item.id)}>Delete</button>
           </div>
         ))}
       </div>
     );
   }
   ```

5. Add form drafts auto-save (optional)
   ```typescript
   // Auto-save form every 30 seconds
   useEffect(() => {
     const interval = setInterval(async () => {
       if (formData.description) {
         await db.formDrafts.put({
           id: 'journal-draft',
           formType: 'journal',
           data: formData,
           savedAt: new Date(),
           userId: user.id
         });
       }
     }, 30000);

     return () => clearInterval(interval);
   }, [formData]);

   // Load draft on mount
   useEffect(() => {
     async function loadDraft() {
       const draft = await db.formDrafts.get('journal-draft');
       if (draft) {
         setFormData(draft.data);
       }
     }
     loadDraft();
   }, []);
   ```

**Result:**
- ✅ Transaction forms work offline
- ✅ Data saved to outbox queue
- ✅ Visual feedback for queued items
- ✅ Can view and manage queue
- ✅ Form drafts auto-saved

---

### Phase 4: Sync Logic (Day 3 - 6 hours)

**Goal:** Auto-sync queued transactions when online

#### Tasks:
1. Create sync service
   ```typescript
   // src/lib/sync-service.ts
   export class SyncService {
     private static isSyncing = false;

     static async syncAll(accessToken: string): Promise<SyncResult> {
       if (this.isSyncing) {
         console.log('Sync already in progress');
         return;
       }

       this.isSyncing = true;

       try {
         const pending = await db.outbox
           .where('status')
           .equals('pending')
           .toArray();

         if (pending.length === 0) {
           return { success: 0, failed: 0, conflicts: 0 };
         }

         let success = 0;
         let failed = 0;
         let conflicts = 0;

         for (const item of pending) {
           try {
             await db.outbox.update(item.id, { status: 'syncing' });

             const result = await this.syncOne(item, accessToken);

             if (result.success) {
               await db.outbox.delete(item.id);
               success++;
             } else if (result.conflict) {
               await db.outbox.update(item.id, {
                 status: 'failed',
                 error: 'Conflict - needs review'
               });
               conflicts++;
             } else {
               const retryCount = item.retryCount + 1;
               if (retryCount >= 3) {
                 await db.outbox.update(item.id, {
                   status: 'failed',
                   error: result.error,
                   retryCount
                 });
                 failed++;
               } else {
                 await db.outbox.update(item.id, {
                   status: 'pending',
                   retryCount
                 });
               }
             }
           } catch (error) {
             await db.outbox.update(item.id, { status: 'pending' });
           }
         }

         return { success, failed, conflicts };
       } finally {
         this.isSyncing = false;
       }
     }

     private static async syncOne(item: Outbox, token: string) {
       const endpoint = item.type === 'journal' ? '/api/journals' : '/api/invoices';

       const response = await fetch(endpoint, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${token}`
         },
         body: JSON.stringify(item.payload)
       });

       if (response.ok) {
         return { success: true };
       } else if (response.status === 409) {
         return { success: false, conflict: true, error: await response.text() };
       } else {
         return { success: false, conflict: false, error: await response.text() };
       }
     }
   }
   ```

2. Add auto-sync triggers
   ```typescript
   // src/lib/auto-sync.ts
   export function setupAutoSync(accessToken: string) {
     // Sync on connection restore
     window.addEventListener('online', async () => {
       console.log('Connection restored, starting sync...');
       await SyncService.syncAll(accessToken);
     });

     // Sync when tab becomes visible
     document.addEventListener('visibilitychange', async () => {
       if (!document.hidden && navigator.onLine) {
         await SyncService.syncAll(accessToken);
       }
     });

     // Periodic sync check (every 30 seconds)
     setInterval(async () => {
       if (navigator.onLine) {
         await SyncService.syncAll(accessToken);
       }
     }, 30000);

     // Initial sync on load
     if (navigator.onLine) {
       SyncService.syncAll(accessToken);
     }
   }
   ```

3. Add sync status notifications
   ```typescript
   // src/components/sync-notifications.tsx
   export function SyncNotifications() {
     const [syncing, setSyncing] = useState(false);
     const [result, setResult] = useState<SyncResult | null>(null);

     useEffect(() => {
       const handler = async () => {
         setSyncing(true);
         const result = await SyncService.syncAll(accessToken);
         setSyncing(false);
         setResult(result);
         setTimeout(() => setResult(null), 5000);
       };

       window.addEventListener('online', handler);
       return () => window.removeEventListener('online', handler);
     }, []);

     if (syncing) {
       return (
         <div className="sync-notification syncing">
           🟡 Syncing transactions...
         </div>
       );
     }

     if (result && (result.success > 0 || result.failed > 0)) {
       return (
         <div className="sync-notification success">
           ✅ Sync complete: {result.success} synced
           {result.conflicts > 0 && `, ${result.conflicts} conflicts`}
           {result.failed > 0 && `, ${result.failed} failed`}
         </div>
       );
     }

     return null;
   }
   ```

4. Add manual sync button
   ```typescript
   // Add to ConnectionStatus component
   async function handleManualSync() {
     setLoading(true);
     await SyncService.syncAll(accessToken);
     setLoading(false);
   }

   return (
     <div className="connection-badge">
       {/* Status display */}
       {pendingCount > 0 && (
         <button onClick={handleManualSync} disabled={loading}>
           Sync Now
         </button>
       )}
     </div>
   );
   ```

5. Add retry logic for failed syncs
   - Max 3 retries
   - Exponential backoff
   - Clear error messages

**Result:**
- ✅ Auto-sync when connection returns
- ✅ Background sync (periodic check)
- ✅ Manual sync button
- ✅ Sync progress notifications
- ✅ Retry failed syncs

---

### Phase 5: Polish & Error Handling (Day 4 - 4 hours)

**Goal:** Production-ready UX and error handling

#### Tasks:
1. Implement conflict resolution UI
   ```typescript
   // src/components/conflict-dialog.tsx
   export function ConflictDialog({ item, onResolve }: ConflictDialogProps) {
     return (
       <div className="modal-overlay">
         <div className="modal">
           <h2>Transaction Needs Attention</h2>
           
           <div className="conflict-details">
             <p className="warning">
               ⚠️ Data changed while you were offline
             </p>
             
             <div className="transaction-info">
               <strong>Transaction Type:</strong> {item.type}
               <strong>Date:</strong> {item.payload.entry_date}
               <strong>Description:</strong> {item.payload.description}
             </div>

             {item.error && (
               <div className="error-message">
                 {item.error}
               </div>
             )}
           </div>

           <div className="actions">
             <button onClick={() => onResolve('edit')}>
               Edit Transaction
             </button>
             <button onClick={() => onResolve('keep')}>
               Keep in Queue
             </button>
             <button onClick={() => onResolve('discard')} className="danger">
               Discard
             </button>
           </div>
         </div>
       </div>
     );
   }
   ```

2. Add comprehensive error messages
   ```typescript
   // src/lib/error-messages.ts
   export const ERROR_MESSAGES = {
     NETWORK_ERROR: 'Unable to connect. Your transaction is saved and will sync when online.',
     CONFLICT: 'Data changed while offline. Please review and resolve conflicts.',
     VALIDATION_ERROR: 'Invalid data. Please check your entries.',
     SERVER_ERROR: 'Server error. Your transaction is saved and will retry automatically.',
     MAX_RETRIES: 'Failed to sync after 3 attempts. Please check the transaction and try again.'
   };
   ```

3. Add sync history/logs
   ```typescript
   // src/features/sync-history-page.tsx
   export function SyncHistoryPage() {
     const [history, setHistory] = useState([]);

     useEffect(() => {
       async function load() {
         const logs = await db.syncHistory.orderBy('timestamp').reverse().limit(50).toArray();
         setHistory(logs);
       }
       load();
     }, []);

     return (
       <div>
         <h1>Sync History</h1>
         <table>
           <thead>
             <tr>
               <th>Time</th>
               <th>Action</th>
               <th>Items</th>
               <th>Details</th>
             </tr>
           </thead>
           <tbody>
             {history.map(log => (
               <tr key={log.id}>
                 <td>{new Date(log.timestamp).toLocaleString()}</td>
                 <td>{log.action}</td>
                 <td>{log.itemCount}</td>
                 <td>{log.details}</td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
     );
   }
   ```

4. Add offline page for reports/master data
   ```typescript
   // src/components/offline-page.tsx
   export function OfflinePage({ title, message }: OfflinePageProps) {
     return (
       <div className="offline-page">
         <div className="offline-icon">⚠️</div>
         <h2>{title}</h2>
         <p>{message}</p>
         <button onClick={() => window.location.reload()}>
           Retry Connection
         </button>
       </div>
     );
   }

   // Usage:
   function ReportsPage() {
     const isOnline = useOnlineStatus();

     if (!isOnline) {
       return (
         <OfflinePage
           title="Connect to View Reports"
           message="Reports require real-time data. Please connect to the internet."
         />
       );
     }

     return <div>{/* Normal reports */}</div>;
   }
   ```

5. Add settings/preferences
   ```typescript
   // src/features/pwa-settings-page.tsx
   export function PWASettingsPage() {
     const [autoSync, setAutoSync] = useState(true);
     const [cacheSize, setCacheSize] = useState(0);

     useEffect(() => {
       async function estimateStorage() {
         if ('storage' in navigator && 'estimate' in navigator.storage) {
           const { usage } = await navigator.storage.estimate();
           setCacheSize(usage);
         }
       }
       estimateStorage();
     }, []);

     async function clearCache() {
       if (confirm('Clear all cached data? You will need internet to reload.')) {
         await db.masterDataCache.clear();
         alert('Cache cleared');
         window.location.reload();
       }
     }

     async function clearOutbox() {
       const count = await db.outbox.count();
       if (confirm(`Delete all ${count} queued transactions? This cannot be undone.`)) {
         await db.outbox.clear();
         alert('Queue cleared');
       }
     }

     return (
       <div className="settings-page">
         <h1>PWA Settings</h1>

         <section>
           <h2>Sync</h2>
           <label>
             <input
               type="checkbox"
               checked={autoSync}
               onChange={(e) => setAutoSync(e.target.checked)}
             />
             Auto-sync when online
           </label>
         </section>

         <section>
           <h2>Storage</h2>
           <p>Cache size: {(cacheSize / 1024).toFixed(2)} KB</p>
           <button onClick={clearCache}>Clear Cache</button>
         </section>

         <section>
           <h2>Queue</h2>
           <button onClick={clearOutbox} className="danger">
             Clear All Queued Transactions
           </button>
         </section>
       </div>
     );
   }
   ```

6. Add comprehensive logging
   - Console logs for debugging
   - Error tracking (Sentry optional)
   - Sync events logged to history

7. Test all error scenarios
   - Network timeout
   - 409 Conflict
   - 500 Server error
   - Invalid token
   - Account deactivated

**Result:**
- ✅ Clear conflict resolution
- ✅ Comprehensive error messages
- ✅ Sync history tracking
- ✅ Offline pages for reports
- ✅ Settings/preferences
- ✅ Production-ready

---

## Tech Stack

### Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "dexie": "^4.0.11"
  },
  "devDependencies": {
    "vite": "^5.4.21",
    "vite-plugin-pwa": "^0.20.5",
    "@vitejs/plugin-react": "^4.7.0",
    "typescript": "^5.7.3",
    "workbox-window": "^7.0.0"
  }
}
```

### Key Technologies

1. **Vite PWA Plugin** (`vite-plugin-pwa`)
   - Zero-config PWA setup
   - Automatic service worker generation
   - Workbox integration
   - Web manifest generation

2. **Dexie.js** (`dexie`)
   - IndexedDB wrapper (already used in POS)
   - Simple, powerful API
   - TypeScript support
   - Transaction support
   - Observable queries

3. **Workbox** (included in vite-plugin-pwa)
   - Service worker strategies
   - Background sync
   - Cache management
   - Routing

### Why These Choices?

- **Vite PWA Plugin**: Easiest setup for Vite projects
- **Dexie**: Already familiar (used in POS), proven
- **Workbox**: Industry standard, battle-tested
- **No additional UI framework**: Keep current setup, just add PWA features

---

## Storage Estimation

### IndexedDB Storage Breakdown

```
Master Data Cache:
├─ Accounts (70 items × ~150 bytes)     = 10.5 KB
├─ Account Types (14 items × ~100 bytes) = 1.4 KB
├─ Items (100 items × ~200 bytes)       = 20.0 KB
└─ Subtotal:                              32 KB

Outbox Queue (max 50 pending):
└─ Transactions (50 × ~1 KB)            = 50 KB

Form Drafts (max 10):
└─ Drafts (10 × ~2 KB)                  = 20 KB

Sync History (last 100 entries):
└─ Logs (100 × ~200 bytes)              = 20 KB

TOTAL ESTIMATED STORAGE:                 ~120 KB
```

### Service Worker Cache (Static Assets)

```
Static Assets Cache:
├─ JavaScript bundle                     = 220 KB
├─ CSS files                            = 20 KB
├─ Icons/Images                         = 30 KB
└─ Subtotal:                             270 KB

API Response Cache (optional):
├─ Recent API responses (10 × ~5 KB)    = 50 KB
└─ Subtotal:                             50 KB

TOTAL CACHE STORAGE:                     ~320 KB
```

### Total PWA Footprint

```
IndexedDB:  120 KB
Cache:      320 KB
TOTAL:      440 KB (~0.44 MB)
```

**Conclusion:** Storage is negligible! Even on low-end devices with limited storage, ~500 KB is tiny. Modern browsers typically allow 50+ MB for PWAs.

---

## Scope Boundaries

### What This PWA DOES Include

✅ **Offline transaction input**
- Journal entries
- Sales invoices (if needed)
- Sales payments (if needed)

✅ **Master data caching (read-only)**
- Chart of Accounts
- Account Types
- Items/Prices

✅ **Auto-sync**
- Automatic when online
- Background periodic check
- Manual trigger available

✅ **Conflict detection**
- Server validates data
- User resolves conflicts
- Clear error messages

✅ **Form drafts**
- Auto-save work in progress
- Resume after interruption

✅ **PWA features**
- Installable app
- Fast loading (cached)
- Works on mobile

### What This PWA DOES NOT Include

❌ **Offline report generation**
- Reports need real-time data
- Multi-user data consistency
- Too complex for offline

❌ **Offline master data editing**
- High conflict risk
- Requires immediate validation
- Multi-user coordination needed

❌ **Extended offline work**
- Not designed for days offline
- Intended for temporary outages
- Cache expires after 24 hours

❌ **Full database sync**
- Only critical input queued
- Historical data not cached
- Server is source of truth

❌ **Complex merge logic**
- No automatic conflict resolution
- Server validation is final
- User makes decisions

❌ **Offline user management**
- Security/auth requires server
- No offline login
- No offline permission changes

### Design Decisions Rationale

| Feature | Decision | Why |
|---------|----------|-----|
| **Reports offline** | ❌ No | Real-time data critical for decisions |
| **Master data edit offline** | ❌ No | High conflict risk, needs validation |
| **Transaction input offline** | ✅ Yes | Can't lose data, time-sensitive |
| **Auto-sync** | ✅ Yes | Seamless UX, user doesn't think about it |
| **Manual sync option** | ✅ Yes | User control, review before sync |
| **Conflict auto-merge** | ❌ No | Too risky, user should decide |
| **Extended offline** | ❌ No | Not the use case, adds complexity |
| **Form drafts** | ✅ Yes | Don't lose work, low cost |

---

## Success Metrics

### After Implementation, We Should See:

1. **Faster Load Times**
   - Target: < 1 second on repeat visits
   - Measurement: Lighthouse Performance Score > 90

2. **Offline Capability**
   - Can create transactions offline
   - Zero data loss during outages
   - Auto-sync success rate > 95%

3. **User Experience**
   - Clear offline indicators
   - No confusion about what works offline
   - Sync conflicts < 1% of transactions

4. **Storage Efficiency**
   - Total storage < 1 MB
   - Cache hit rate > 80% for master data
   - No storage quota issues

5. **Installation**
   - App installable on mobile/desktop
   - PWA install prompt shows correctly
   - Installed app works offline

---

## Testing Checklist

### Manual Testing

- [ ] Install app on desktop (Chrome "Install App")
- [ ] Install app on mobile (Android Chrome, iOS Safari)
- [ ] Disconnect internet, verify offline indicator
- [ ] Create transaction offline
- [ ] Reconnect, verify auto-sync
- [ ] Disconnect during form entry, verify draft saved
- [ ] Try to view reports offline, see "connect required"
- [ ] Try to edit accounts offline, buttons disabled
- [ ] Create transaction with deactivated account offline
- [ ] Verify conflict resolution UI
- [ ] Clear cache, verify data refetches
- [ ] Test with poor connection (throttle network)
- [ ] Test sync queue management (view/edit/delete)
- [ ] Verify sync history logs
- [ ] Test manual sync button
- [ ] Test with expired cache (24h+ old)

### Automated Testing (Optional)

```typescript
// Example test
describe('Offline Functionality', () => {
  it('should save transaction to outbox when offline', async () => {
    // Mock offline
    Object.defineProperty(navigator, 'onLine', { value: false });
    
    // Submit form
    await submitTransaction({ /* data */ });
    
    // Check outbox
    const pending = await db.outbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('pending');
  });

  it('should sync when connection returns', async () => {
    // Add item to outbox
    await db.outbox.add({ /* item */ });
    
    // Mock online
    Object.defineProperty(navigator, 'onLine', { value: true });
    
    // Trigger sync
    window.dispatchEvent(new Event('online'));
    
    // Wait for sync
    await waitFor(() => {
      expect(db.outbox.count()).toBe(0);
    });
  });
});
```

---

## Migration Plan (From SPA to PWA)

### Zero-Downtime Migration

**Phase 1: Add PWA (Non-breaking)**
- Deploy Phase 1-2 (installable app + cache)
- Current users see no change
- New visits get PWA benefits

**Phase 2: Enable Offline (Opt-in)**
- Deploy Phase 3-5 (offline input + sync)
- Add banner: "📱 New: Work offline! Click to learn more"
- User opt-in for offline features

**Phase 3: Monitor & Refine**
- Monitor sync success rates
- Gather user feedback
- Fix edge cases
- Optimize cache sizes

**Phase 4: Default On**
- Make offline features default
- Keep online-only as fallback
- Full PWA experience

### Rollback Plan

If issues occur:
1. Disable service worker registration
2. Clear caches
3. Revert to SPA
4. No data loss (server is source of truth)

---

## Maintenance & Monitoring

### Ongoing Tasks

**Weekly:**
- Check sync success rates
- Review error logs
- Monitor storage usage

**Monthly:**
- Update cache TTLs if needed
- Review conflict resolution patterns
- Optimize cache sizes

**Quarterly:**
- Review offline usage patterns
- Consider feature enhancements
- Update dependencies

### Monitoring Points

```typescript
// Track key metrics
analytics.track('pwa_install', { platform });
analytics.track('offline_transaction_created', { type });
analytics.track('sync_success', { count, duration });
analytics.track('sync_conflict', { type, reason });
analytics.track('sync_failed', { error, retries });
```

---

## FAQ

### Q: What happens if user works offline for days?

**A:** Not recommended. Cache expires after 24 hours. Master data becomes stale. Reports unavailable. User should sync at least daily.

### Q: What if two users edit same data offline?

**A:** Last sync wins for transactions (new entries). For master data editing, it's disabled offline to prevent conflicts.

### Q: Can user work on multiple devices offline?

**A:** Yes, each device has its own outbox. Both will sync when online. New transactions won't conflict (different IDs).

### Q: What if sync fails repeatedly?

**A:** After 3 retries, marked as failed. User notified to review. Can manually edit and retry or discard.

### Q: How much storage does PWA use?

**A:** ~500 KB total (0.5 MB). Negligible on modern devices.

### Q: Can we add more features later?

**A:** Yes! Architecture is extensible. Can add:
- Offline reports (read-only cached)
- More transaction types
- Longer cache TTLs
- Background sync API

### Q: What about iOS Safari limitations?

**A:** iOS Safari supports PWA since iOS 11.3. Some limitations:
- No background sync
- Cache cleared if app unused for weeks
- Still works, just less persistent

### Q: Do we need to maintain both POS and backoffice offline logic?

**A:** Yes, but they share patterns:
- Both use Dexie
- Both use outbox pattern
- Can share sync utilities
- Can share conflict resolution UI

---

## Conclusion

This **Hybrid PWA** approach provides:

✅ **Best of both worlds**
- Fast, installable app
- Works offline when needed
- Doesn't add complexity for online use

✅ **Risk mitigation**
- Server is source of truth
- No automatic overwrites
- Clear user communication

✅ **Maintainable**
- Simple architecture
- Reuses POS patterns
- Incremental enhancement

✅ **Production-ready**
- Comprehensive error handling
- Conflict resolution
- User settings

**Next Step:** Approve this plan and proceed with Phase 1 implementation!

---

## Appendix A: File Structure

```
apps/backoffice/
├─ public/
│  ├─ icons/
│  │  ├─ icon-192x192.png
│  │  └─ icon-512x512.png
│  └─ robots.txt
│
├─ src/
│  ├─ lib/
│  │  ├─ offline-db.ts          # Dexie schema
│  │  ├─ cache-service.ts       # Master data cache
│  │  ├─ outbox-service.ts      # Transaction queue
│  │  ├─ sync-service.ts        # Sync logic
│  │  ├─ auto-sync.ts           # Auto-sync triggers
│  │  └─ connection.ts          # Online/offline detection
│  │
│  ├─ components/
│  │  ├─ connection-status.tsx  # Status badge
│  │  ├─ offline-banner.tsx     # Banner notification
│  │  ├─ sync-notifications.tsx # Sync feedback
│  │  ├─ conflict-dialog.tsx    # Conflict resolution
│  │  └─ offline-page.tsx       # Offline placeholder
│  │
│  ├─ features/
│  │  ├─ transactions-page.tsx  # Modified for offline
│  │  ├─ sync-queue-page.tsx    # Queue management
│  │  ├─ sync-history-page.tsx  # Sync logs
│  │  └─ pwa-settings-page.tsx  # PWA settings
│  │
│  └─ hooks/
│     ├─ use-online-status.ts   # Online/offline hook
│     ├─ use-accounts.ts        # Modified for cache
│     └─ use-journals.ts        # Modified for offline
│
├─ vite.config.ts               # PWA config
└─ package.json                 # New dependencies
```

---

## Appendix B: Key Code Snippets

### Service Worker Config (vite.config.ts)

```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Jurnapod Backoffice',
        short_name: 'Jurnapod',
        theme_color: '#2f5f4a',
        icons: [/* ... */]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ]
});
```

### Dexie Schema (offline-db.ts)

```typescript
import Dexie, { Table } from 'dexie';

class OfflineDatabase extends Dexie {
  outbox!: Table<Outbox>;
  masterDataCache!: Table<MasterDataCache>;
  formDrafts!: Table<FormDraft>;

  constructor() {
    super('jurnapod_backoffice');
    this.version(1).stores({
      outbox: 'id, status, timestamp, userId',
      masterDataCache: 'type, expiresAt',
      formDrafts: 'id, formType, userId'
    });
  }
}

export const db = new OfflineDatabase();
```

### Offline Hook (use-online-status.ts)

```typescript
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

---

**End of Document**

*Last Updated: 2024-02-25*  
*Version: 1.0*  
*Author: AI Assistant*
