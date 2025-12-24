# List Layout Design Framework

This document describes the design and interaction framework for all list-based components (e.g., documents, transactions, accounts, bank statements) in the LedgerAI platform. All new and refactored list UIs must adhere to these standards for a consistent, user-friendly experience.

## 1. Responsive, Mobile-First Design
- All lists must be designed mobile-first, with layouts that adapt gracefully to desktop and tablet.
- Use a single-column, card-based layout on mobile; use a grid or table-like layout on desktop/tablet.

## 2. Selection via Long-Press (Mobile)
- On mobile, long-pressing a list item enters selection mode and displays checkboxes for all items.
- On desktop/tablet, checkboxes are always visible for multi-select.
- Once in selection mode, users can tap checkboxes to select/deselect items.

## 3. Expandable Rows for Details
- A single tap/click on a list item expands/collapses a details panel below the item.
- The details panel should use a visually structured layout (labels, badges, grid, etc.), not plain text.
- Only minimal summary info is shown in the collapsed state.

## 4. Sticky Bottom Action Panel
- When one or more items are selected, a sticky action panel appears at the bottom of the viewport.
- The panel contains all relevant bulk actions (e.g., delete, reprocess, verify, publish).
- The panel is always visible while items are selected, on all screen sizes.

## 5. Top Menu for Navigation
- The top of the page should contain navigation and context controls (breadcrumbs, filters, etc.).
- The sticky action panel should never overlap or obscure the top menu.

## 6. Accessibility & Touch Targets
- All interactive elements (checkboxes, buttons) must have large enough touch targets for mobile.
- Use semantic HTML and ARIA attributes where appropriate.

## 7. Visual Consistency
- Use consistent spacing, border radius, and color schemes as defined in the design system.
- Use badges, icons, and color cues for statuses and important metadata.

## 8. Example Reference
- The `DocumentsList` component in `src/components/documents/documents-list.tsx` is the canonical reference implementation for this framework.

---
**All list UIs must be reviewed for adherence to this framework before merging.**