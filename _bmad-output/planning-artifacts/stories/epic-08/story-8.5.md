---
epic: 8
story: 8.5
title: Build Reusable ImportWizard Component
priority: P0
status: Ready
estimate: 2-3 hours
dependencies: None (can be done in parallel)
---

# Story 8.5: Build Reusable ImportWizard Component

## User Story

As a **developer**,  
I want to **create a generic ImportWizard component**,  
So that **both items and prices can use consistent import UX**.

## Acceptance Criteria

### Component API

**Given** any import feature needs a wizard  
**When** I use `<ImportWizard config={importConfig} />`  
**Then** a 3-step wizard renders: Source → Preview → Apply

### Step 1: Source

**Given** the Source step  
**When** the user pastes CSV data  
**Then** the data is captured and can be processed

**Given** the Source step  
**When** the user uploads a file  
**Then** the file content is read and captured

**Given** the Source step  
**When** no data is provided  
**Then** the "Next" button is disabled

### Step 2: Preview

**Given** the Preview step  
**When** validation completes  
**Then** a table shows rows with status (Create/Error) and error messages

**Given** the Preview step has errors  
**When** the user views the preview  
**Then** error rows are highlighted with specific error messages

**Given** the Preview step has valid rows  
**When** the user clicks "Import"  
**Then** the Apply step shows progress

**Given** no valid rows in Preview  
**When** user tries to import  
**Then** import button is disabled

### Step 3: Apply

**Given** the Apply step  
**When** import is processing  
**Then** progress bar shows completion percentage

**Given** the Apply step completes  
**When** all rows are processed  
**Then** a summary shows: Success count, Failed count

**Given** the Apply step completes with failures  
**When** showing results  
**Then** failed rows are listed with error details

### Reusability

**Given** the wizard is reusable  
**When** used for Items import vs Prices import  
**Then** only the column definitions and API endpoints differ

**Given** the wizard is reusable  
**When** configured for different entity types  
**Then** the same 3-step pattern is maintained consistently

## Technical Implementation

### Files to Create

1. **`apps/backoffice/src/components/import-wizard.tsx`** - Main component
2. **`apps/backoffice/src/components/import-wizard.test.tsx`** - Component tests
3. **`apps/backoffice/src/components/import-wizard.types.ts`** - Type definitions

### Type Definitions

```typescript
// apps/backoffice/src/components/import-wizard.types.ts

export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  validator?: (value: string) => string | null; // returns error message or null
}

export interface ImportRow {
  rowIndex: number;
  original: Record<string, string>;
  parsed: Record<string, unknown>;
  action: 'CREATE' | 'SKIP' | 'ERROR';
  error?: string;
}

export interface ImportWizardConfig {
  title: string;
  entityName: string; // "items", "prices", etc.
  columns: ImportColumn[];
  csvTemplate: string; // Example CSV header + row
  parseRow: (row: Record<string, string>) => Record<string, unknown> | null;
  validateRow: (parsed: Record<string, unknown>) => string | null;
  importFn: (rows: ImportRow[]) => Promise<ImportResult>;
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

export type ImportStep = 'source' | 'preview' | 'apply';
```

### Component Structure

```typescript
// apps/backoffice/src/components/import-wizard.tsx
import { Modal, Stepper, Textarea, FileInput, Table, Button, Progress, Alert } from '@mantine/core';

interface ImportWizardProps {
  opened: boolean;
  onClose: () => void;
  config: ImportWizardConfig;
}

export function ImportWizard({ opened, onClose, config }: ImportWizardProps) {
  const [activeStep, setActiveStep] = useState<ImportStep>('source');
  const [sourceText, setSourceText] = useState('');
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);

  const processSource = () => {
    // Parse CSV/TSV from sourceText
    // Validate each row
    // Build ImportRow array
    // Move to preview step
  };

  const runImport = async () => {
    // Call config.importFn with valid rows
    // Show progress
    // Move to result step
  };

  return (
    <Modal opened={opened} onClose={onClose} title={config.title} size="lg">
      <Stepper active={activeStep}>
        <Stepper.Step label="Source" description="Paste or upload CSV">
          {/* Source step content */}
        </Stepper.Step>
        
        <Stepper.Step label="Preview" description="Review before import">
          {/* Preview step content */}
        </Stepper.Step>
        
        <Stepper.Step label="Apply" description="Import data">
          {/* Apply step content */}
        </Stepper.Step>
      </Stepper>
    </Modal>
  );
}
```

### Step Components

1. **ImportSourceStep** - Textarea for paste, FileInput for upload, CSV template display
2. **ImportPreviewStep** - Table showing parsed rows with validation status
3. **ImportApplyStep** - Progress bar, results summary, error details

### Usage Examples

```typescript
// For Items import
const itemsImportConfig: ImportWizardConfig = {
  title: 'Import Items',
  entityName: 'items',
  columns: [
    { key: 'sku', header: 'SKU', required: true },
    { key: 'name', header: 'Name', required: true },
    { key: 'type', header: 'Type', required: true },
    { key: 'item_group_code', header: 'Group Code' },
    { key: 'is_active', header: 'Active' },
  ],
  csvTemplate: 'sku,name,type,item_group_code,is_active\nSKU001,Product A,PRODUCT,GRP001,true',
  parseRow: (row) => ({ /* parsing logic */ }),
  validateRow: (parsed) => { /* validation logic */ },
  importFn: async (rows) => { /* API call */ },
};

// For Prices import
const pricesImportConfig: ImportWizardConfig = {
  title: 'Import Prices',
  entityName: 'prices',
  columns: [
    { key: 'item_sku', header: 'Item SKU', required: true },
    { key: 'price', header: 'Price', required: true },
    { key: 'is_active', header: 'Active' },
    { key: 'scope', header: 'Scope' },
    { key: 'outlet_id', header: 'Outlet ID' },
  ],
  csvTemplate: 'item_sku,price,is_active,scope,outlet_id\nSKU001,25000,true,outlet,1',
  // ... rest of config
};
```

## Files to Modify

None - new component creation.

## Dependencies

- ✅ Mantine Stepper, Modal, Table components
- ✅ PapaParse or similar CSV parsing library (check if already in project)
- ✅ Existing file upload handling

## Definition of Done

- [ ] Component created at `apps/backoffice/src/components/import-wizard.tsx`
- [ ] TypeScript types defined
- [ ] 3-step wizard working: Source → Preview → Apply
- [ ] CSV paste input works
- [ ] File upload works
- [ ] Validation shows errors in Preview step
- [ ] Progress bar shows during import
- [ ] Results summary displayed
- [ ] Component accepts configuration prop
- [ ] Can be used for both Items and Prices
- [ ] Tests written

## Size Target

**Target:** ~200-300 lines for main component

## Notes

- This component replaces duplicate import logic in items-prices-page.tsx
- Keep configuration flexible for future entity types
- CSV parsing should handle common edge cases (quotes, commas)
- Validation should be clear and actionable
