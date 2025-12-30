# Changelog

## Unreleased (2025-12-31)
- Fix: Use `Link` for settings upgrade button; add missing hook deps and clean ESLint errors.
- Fix: Avoid Edge-runtime warnings by switching Supabase static imports to dynamic imports / lazy factories.
- Fix: Improve testability of `AIProcessingService` by dynamically importing typed helpers during duplicate detection; adjust duplicate handling to allow updating existing transactions.
