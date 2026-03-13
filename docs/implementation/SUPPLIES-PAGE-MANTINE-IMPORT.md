# Supplies Page Enhancement - Mantine + Import Flow

## Overview

Refactor the supplies management page in the backoffice to use Mantine components and implement an import-first workflow for bulk operations. Replace the current inline editable table with a read-only list + guided import modal.

## Scope

### Files Modified

1. **`apps/backoffice/src/features/supplies-page.tsx`** - Main page component (full rewrite)
2. **`apps/backoffice/src/features/supplies-import-utils.ts`** - New file for import logic (NEW)

### No Backend Changes

- Keep existing API endpoints unchanged:
  - `GET /inventory/supplies` - List supplies
  - `POST /inventory/supplies` - Create supply
  - `PATCH /inventory/supplies/:id` - Update supply
  - `DELETE /inventory/supplies/:id` - Delete supply

---

## Implementation Details

### Type Definitions

```typescript
export type NormalizedSupplyRow = {
  sku: string | null;
  name: string;
  unit: string;
  is_active: boolean;
};

export type ValidationError = {
  row: number;
  field: string;
  message: string;
};

export type ImportAction = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

export type ImportPlanRow = {
  rowIndex: number;
  original: NormalizedSupplyRow;
  action: ImportAction;
  existingSupplyId?: number;
  reason?: string;
  error?: string;
};

export type ImportSummary = {
  create: number;
  update: number;
  skip: number;
  error: number;
  total: number;
};

export type ApplyResult = {
  rowIndex: number;
  action: ImportAction;
  success: boolean;
  supplyId?: number;
  error?: string;
};

export type NormalizedSupplyRowWithRaw = NormalizedSupplyRow & {
  is_active_raw: string;
};
```

### Functions

#### `parseDelimited(text: string): string[][]`
- Detect delimiter (comma, tab, semicolon)
- Handle quoted fields with internal delimiters
- Return array of rows, each row is array of cells

#### `normalizeHeaderName(name: string): "sku" | "name" | "unit" | "is_active" | null`
- Case-insensitive column mapping
- Map: `sku`, `kode`, `code` → sku
- Map: `name`, `nama`, `nama barang` → name
- Map: `unit`, `satuan` → unit
- Map: `active`, `is_active`, `status`, `aktif` → is_active

#### `toBoolean(value: string): boolean | null`
- True: `true`, `1`, `yes`, `y`, `aktif`, `active`, empty string
- False: `false`, `0`, `no`, `n`, `nonaktif`, `inactive`
- Null: invalid non-empty tokens (e.g., "tru", "aktive")

#### `normalizeImportRow(cells: string[], header: string[]): NormalizedSupplyRowWithRaw`
- Map cells to canonical names by header position
- Trim all strings
- Default unit to "unit" if empty
- Default is_active to true if empty
- Track raw is_active value for validation

#### `validateImportRows(rows: NormalizedSupplyRowWithRaw[]): ValidationError[]`
- Check required: name must not be empty
- Check max length: name (200), sku (50), unit (50)
- Check invalid is_active values
- Check duplicates in import file:
  - Duplicate SKU when SKU present
  - **Aggregate duplicate detection**: if any row for a name+unit has missing SKU, all later duplicates of that key are flagged as ERROR
- O(1) lookup via row index map

#### `buildImportPlan(rows: NormalizedSupplyRowWithRaw[], existingSupplies: Supply[]): ImportPlanRow[]`
- **SKU-first matching**: when SKU is provided, match only by SKU (no fallback to name+unit)
- **Fallback matching**: only when SKU is empty, match by name+unit exact match
- **Aggregate CREATE collision guard**: if any CREATE row for a name+unit has missing SKU, later duplicates are flagged
- **Existing supply collision guard**: if multiple rows target the same existing supply ID, second+ are flagged as ERROR
- Determine action:
  - No match → CREATE
  - Match + identical → SKIP
  - Match + different → UPDATE

#### `computeImportSummary(plan: ImportPlanRow[]): ImportSummary`
- Count create, update, skip, error actions

---

## State Model

```typescript
// Page state
const [supplies, setSupplies] = useState<Supply[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [successMessage, setSuccessMessage] = useState<string | null>(null);
const [showInactive, setShowInactive] = useState(false);
const [searchQuery, setSearchQuery] = useState("");

// Import modal state
const [importOpened, importHandlers] = useDisclosure(false);
const [importStep, setImportStep] = useState<"source" | "preview" | "apply">("source");
const [importText, setImportText] = useState("");
const [importPlan, setImportPlan] = useState<ImportPlanRow[]>([]);
const [importSummary, setImportSummary] = useState<ImportSummary>({ create: 0, update: 0, skip: 0, error: 0, total: 0 });

// Apply state
const [isApplying, setIsApplying] = useState(false);
const [applyIndex, setApplyIndex] = useState(0);
const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
const [hasAppliedImport, setHasAppliedImport] = useState(false);

// Add single supply modal
const [addOpened, addHandlers] = useDisclosure(false);
const [newSupplyForm, setNewSupplyForm] = useState({ sku: "", name: "", unit: "unit", is_active: true });
const [creatingSupply, setCreatingSupply] = useState(false);

// Delete modal
const [deleteTarget, setDeleteTarget] = useState<Supply | null>(null);
const [deletingSupplyId, setDeletingSupplyId] = useState<number | null>(null);
```

---

## Import Matching Rules

### SKU-First Policy (Strict)
- When a row has a SKU → match **only** by that SKU
- No fallback to name+unit matching when SKU is provided but not found → CREATE
- This prevents accidental updates when SKU is mistyped

### Fallback Policy
- When a row has **no SKU** → match by exact name+unit combination
- If no match found → CREATE

### Duplicate Detection

#### Within Import File
1. **Same SKU duplicate**: ERROR
2. **Same name+unit with all rows having SKU**: Allowed (treated as separate potential updates)
3. **Any row missing SKU + duplicate name+unit**: ERROR for all duplicates after the first
   - Uses aggregate tracking: once a missing-SKU row appears for a key, all later duplicates are flagged

#### Collision with Existing Records
1. **Multiple rows targeting same existing supply ID**: ERROR for second+ rows
2. **One row updates, another creates same name+unit**: Allowed (create takes priority)

---

## UI Features

### Header Card
- Title: "Supplies"
- Description with operational guidance
- KPI badges: Total, Active, Inactive, Visible
- Actions: Import supplies (primary), Add one supply (secondary)

### Filters Card
- Search input (name, SKU, unit)
- Show inactive toggle
- Reset filters button when filters active

### Supplies List Table
- Read-only table with columns: ID, SKU, Name, Unit, Status, Updated, Actions
- Delete action with confirmation modal
- Empty states: no data vs no filter matches

### Import Modal (3-Step)

**Step 1: Source**
- Paste data textarea
- File upload (.csv, .txt)
- Template hint shown

**Step 2: Preview**
- Action badges: CREATE (green), UPDATE (blue), SKIP (gray), ERROR (red)
- Summary counts
- Reason/error messages per row

**Step 3: Apply**
- Progress bar
- Per-row results
- Final summary
- Idempotent: button disabled after completion until "Start over"

---

## Acceptance Criteria

1. **Page uses Mantine components exclusively** - No inline style objects
2. **Import is the primary bulk operation** - Button clearly visible in header
3. **Import flow has 3 clear steps** - Source → Preview → Apply
4. **Preview shows action badges** - CREATE (green), UPDATE (blue), SKIP (gray), ERROR (red)
5. **Apply shows progress** - Progress bar + counts update during execution
6. **List is read-only** - No inline editable fields
7. **Delete requires confirmation** - Modal with supply name displayed
8. **Filters work correctly** - Search + show inactive toggle
9. **Empty states are clear** - Different messages for no data vs no matches
10. **Offline behavior unchanged** - Uses existing OfflinePage component
11. **SKU-first matching** - No fallback to name+unit when SKU provided
12. **Apply idempotent** - Button disabled after completion
13. **TypeScript compiles** - `npm run -w apps/backoffice typecheck` passes
14. **Build succeeds** - `npm run -w apps/backoffice build` passes

---

## Test Scenarios

### Import Flow

1. **Create new supplies**
   - Upload CSV: `SKU1,Name1,unit,true\nSKU2,Name2,pack,false`
   - Preview shows 2 CREATE actions
   - Apply → Both created → List refreshes

2. **Update existing supplies**
   - Supply exists: SKU=`PAPER-A4`, Name=`A4 Paper`, Unit=`pack`
   - Import: `PAPER-A4,A4 Paper,box,true` (unit changed)
   - Preview shows 1 UPDATE action
   - Apply → Supply updated

3. **Skip unchanged supplies**
   - Supply exists: SKU=`PAPER-A4`, Name=`A4 Paper`, Unit=`pack`, Active=true
   - Import: same values
   - Preview shows 1 SKIP action

4. **Error handling**
   - Import row with empty name → ERROR in preview
   - Invalid is_active (e.g., "tru") → ERROR in preview
   - API failure during apply → Marked as failed, continue to next

### SKU-First Matching

1. **SKU typo with matching name+unit should CREATE**
   - Existing: SKU=`A100`, Name=`Paper`, Unit=`pack`
   - Import: `A999,Paper,pack,true` (different SKU, same name+unit)
   - Preview: CREATE (not UPDATE, because SKU doesn't match)

2. **Empty SKU with matching name+unit should UPDATE**
   - Existing: SKU=`A100`, Name=`Paper`, Unit=`pack`
   - Import: `,Paper,pack,true` (no SKU)
   - Preview: UPDATE (matched by name+unit)

### Duplicate Detection

1. **Mixed SKU/no-SKU duplicates**
   - Import: `,Paper,pack` + `A100,Paper,pack` + `B200,Paper,pack`
   - Preview: row1 CREATE, row2 ERROR, row3 ERROR

2. **Same SKU duplicates**
   - Import: `A100,Paper,pack` + `A100,Paper,pack`
   - Preview: row1 CREATE, row2 ERROR (duplicate SKU)

3. **Same name+unit all with SKU**
   - Import: `A100,Paper,pack` + `B100,Paper,pack`
   - Preview: both CREATE (allowed, different SKUs)

### Filtering

1. Search "paper" → shows supplies with "paper" in name/sku/unit
2. Toggle "Show inactive" → includes inactive in list
3. Reset filters → clears search and shows active only

### Delete

1. Click delete on supply → Modal opens with name
2. Confirm → Supply deleted, success message shown
3. Cancel → Modal closes, no change

---

## Notes

- **Import matching logic**: SKU first (strict), fallback to name+unit only when SKU is empty
- **Delimiter detection**: Auto-detect comma, tab, semicolon
- **Boolean parsing**: Accept `true/false/1/0/yes/no/y/n/aktif/active/inactive/nonaktif`, returns null for invalid tokens
- **Default values**: unit defaults to "unit", is_active defaults to true
- **Aggregate duplicate tracking**: uses `{ hasAnyMissingSku: boolean }` to track if any row for a key had missing SKU
