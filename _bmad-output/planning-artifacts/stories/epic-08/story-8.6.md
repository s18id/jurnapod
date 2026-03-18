---
epic: 8
story: 8.6
title: Remove Inline Editing - Implement Explicit Edit Modals
priority: P0
status: Ready
estimate: 2-3 hours
dependencies: Stories 8.3, 8.4
---

# Story 8.6: Remove Inline Editing - Implement Explicit Edit Modals

## User Story

As a **backoffice user**,  
I want to **edit items and prices through explicit modals**,  
So that **I don't accidentally change data while browsing**.

## Acceptance Criteria

### No Inline Editing

**Given** I'm viewing the Items or Prices list  
**When** I click on a row or "Edit" button  
**Then** an edit modal opens (no inline form fields in the table)

**Given** the old items-prices-page had inline editing  
**When** this story is complete  
**Then** no inline editing remains in the new pages

**Given** a user is browsing the list  
**When** they accidentally click on a field  
**Then** no edit mode is triggered (safe browsing experience)

### Edit Modal Behavior

**Given** an edit modal is open  
**When** I modify data  
**Then** the list behind doesn't change until I click "Save"

**Given** I make changes in the edit modal  
**When** I click "Cancel"  
**Then** the modal closes without saving changes

**Given** I make changes in the edit modal  
**When** I click "Save"  
**Then** changes are saved, modal closes, and list refreshes

**Given** I try to save with invalid data  
**When** validation fails  
**Then** error messages appear and modal stays open

### Unsaved Changes Protection

**Given** an edit modal with unsaved changes  
**When** I try to close it (click Cancel or press Escape)  
**Then** I see a confirmation: "Discard unsaved changes?"

**Given** the unsaved changes confirmation  
**When** I click "Keep Editing"  
**Then** the modal stays open with my changes intact

**Given** the unsaved changes confirmation  
**When** I click "Discard"  
**Then** the modal closes and changes are lost

## Technical Implementation

### What to Remove

From `items-prices-page.tsx` (old file), remove these patterns:

```typescript
// REMOVE: Inline editing state
const [editingItemId, setEditingItemId] = useState<number | null>(null);
const [itemDraft, setItemDraft] = useState<Partial<Item>>({});
const [savingItem, setSavingItem] = useState<number | null>(null);
const [editingDefaultPriceId, setEditingDefaultPriceId] = useState<number | null>(null);
const [editingOutletPriceId, setEditingOutletPriceId] = useState<number | null>(null);

// REMOVE: Inline editing handlers
const startEditingItem = (item: Item) => { ... };
const saveItemEdit = async (itemId: number) => { ... };
const cancelItemEdit = () => { ... };

// REMOVE: Inline form fields in table rows
// (Replace with read-only display + "Edit" button)
```

### What to Implement

In new pages (`items-page.tsx`, `prices-page.tsx`), implement:

```typescript
// NEW: Modal-based editing state
const [editModalOpen, setEditModalOpen] = useState(false);
const [editingItem, setEditingItem] = useState<Item | null>(null);
const [editFormData, setEditFormData] = useState<Partial<Item>>({});
const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

// NEW: Edit handlers
const openEditModal = (item: Item) => {
  setEditingItem(item);
  setEditFormData({ ...item });
  setHasUnsavedChanges(false);
  setEditModalOpen(true);
};

const handleFormChange = (field: string, value: unknown) => {
  setEditFormData(prev => ({ ...prev, [field]: value }));
  setHasUnsavedChanges(true);
};

const saveEdit = async () => {
  if (!editingItem) return;
  
  try {
    await updateItemAPI(editingItem.id, editFormData);
    setEditModalOpen(false);
    setHasUnsavedChanges(false);
    refresh(); // Refresh list
  } catch (error) {
    // Show error in modal
  }
};

const closeEditModal = () => {
  if (hasUnsavedChanges) {
    // Show confirmation modal
    setConfirmDiscardOpen(true);
  } else {
    setEditModalOpen(false);
  }
};
```

### Modal Structure

```tsx
// Edit Item Modal
<Modal
  opened={editModalOpen}
  onClose={closeEditModal}
  title="Edit Item"
  size="lg"
>
  <Stack gap="md">
    <TextInput
      label="SKU"
      value={editFormData.sku}
      onChange={(e) => handleFormChange('sku', e.target.value)}
    />
    <TextInput
      label="Name"
      value={editFormData.name}
      onChange={(e) => handleFormChange('name', e.target.value)}
    />
    <Select
      label="Type"
      value={editFormData.type}
      onChange={(value) => handleFormChange('type', value)}
      data={['PRODUCT', 'SERVICE', 'INGREDIENT', 'RECIPE']}
    />
    {/* ... more fields */}
    
    <Group justify="flex-end" mt="md">
      <Button variant="default" onClick={closeEditModal}>
        Cancel
      </Button>
      <Button onClick={saveEdit} loading={saving}>
        Save Changes
      </Button>
    </Group>
  </Stack>
</Modal>

// Discard Confirmation Modal
<Modal
  opened={confirmDiscardOpen}
  onClose={() => setConfirmDiscardOpen(false)}
  title="Unsaved Changes"
  size="sm"
>
  <Text>You have unsaved changes. Discard them?</Text>
  <Group justify="flex-end" mt="md">
    <Button variant="default" onClick={() => setConfirmDiscardOpen(false)}>
      Keep Editing
    </Button>
    <Button color="red" onClick={() => {
      setConfirmDiscardOpen(false);
      setEditModalOpen(false);
      setHasUnsavedChanges(false);
    }}>
      Discard
    </Button>
  </Group>
</Modal>
```

### Table Changes

**Before (inline editing):**
```tsx
<Table.Td>
  {editingItemId === item.id ? (
    <TextInput value={itemDraft.name} onChange={...} />
  ) : (
    <Text>{item.name}</Text>
  )}
</Table.Td>
```

**After (read-only + edit button):**
```tsx
<Table.Td>{item.name}</Table.Td>
// ...
<Table.Td>
  <Menu>
    <Menu.Target>
      <Button variant="subtle" size="xs">Actions</Button>
    </Menu.Target>
    <Menu.Dropdown>
      <Menu.Item onClick={() => openEditModal(item)}>Edit</Menu.Item>
      <Menu.Item onClick={() => openDeleteModal(item)}>Delete</Menu.Item>
    </Menu.Dropdown>
  </Menu>
</Table.Td>
```

## Files to Modify

1. **`apps/backoffice/src/features/items-page.tsx`** - Ensure no inline editing
2. **`apps/backoffice/src/features/prices-page.tsx`** - Ensure no inline editing

## Dependencies

- ✅ Stories 8.3 and 8.4 (pages must exist)
- ✅ Mantine Modal, Menu components
- ✅ Existing form components

## Definition of Done

- [ ] No inline form fields in Items table
- [ ] No inline form fields in Prices table
- [ ] Edit modals open on "Edit" action
- [ ] Modals have explicit Save and Cancel buttons
- [ ] Unsaved changes confirmation works
- [ ] Data only saves when user clicks Save
- [ ] List refreshes after successful save
- [ ] Error handling in modals works
- [ ] Safe browsing (no accidental edits)

## Benefits

1. **Prevents accidental changes** - No more editing while scrolling
2. **Clearer UX** - Explicit actions for editing
3. **Better validation** - Can validate entire form before save
4. **Safer bulk browsing** - Users can review without risk

## Notes

- This is a **safety and UX improvement**
- Users must consciously choose to edit
- Pattern should be consistent across all backoffice pages
- Future pages should follow this pattern (no inline editing)
