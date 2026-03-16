# Epic 8 Stories

Individual story files for **Backoffice-Items-Split** epic.

## Story Files

| Story | Title | Estimate | Dependencies | Status |
|-------|-------|----------|--------------|--------|
| [8.1](./story-8.1.md) | Extract useItems Hook with Caching | 2-3h | None | Ready |
| [8.2](./story-8.2.md) | Extract useItemGroups Hook | 1-2h | Pattern from 8.1 | Ready |
| [8.3](./story-8.3.md) | Create New /items Page | 3-4h | 8.1, 8.2 | Ready |
| [8.4](./story-8.4.md) | Create New /prices Page | 3-4h | 8.1, 8.2 | Ready |
| [8.5](./story-8.5.md) | Build Reusable ImportWizard Component | 2-3h | None | Ready |
| [8.6](./story-8.6.md) | Remove Inline Editing | 2-3h | 8.3, 8.4 | Ready |
| [8.7](./story-8.7.md) | Add Visual Pricing Hierarchy | 2h | 8.4 | Ready |
| [8.8](./story-8.8.md) | Update Routing and Cross-Navigation | 1-2h | 8.3, 8.4 | Ready |

## Implementation Order

### Phase 1: Foundation (Stories 8.1, 8.2, 8.5)
These can be done in parallel:
- 8.1: Extract useItems hook
- 8.2: Extract useItemGroups hook  
- 8.5: Build ImportWizard component

### Phase 2: Pages (Stories 8.3, 8.4)
Depends on Phase 1:
- 8.3: Create /items page
- 8.4: Create /prices page

### Phase 3: Polish (Stories 8.6, 8.7, 8.8)
Depends on Phase 2:
- 8.6: Remove inline editing
- 8.7: Add visual hierarchy
- 8.8: Update routing

## Quick Links

- [Epic 8 Full Details](../../epics-backoffice-ux.md#epic-8-backoffice-items-split)
- [All Epics](../../epics-backoffice-ux.md)
- [Main Index](../../index.md)

## Total Effort

**8 Stories | 16-21 hours | 3 Phases**
