# Changelog

## 0.1.0 (2026-11-15)

First release.

- Groups, people and expenses with equal, exact, shares and percent splits, all in integer minor units with deterministic remainder distribution.
- Expression keypad in a bottom sheet (`1200+340/2`), people chips, hold a chip for exact, shares or percent.
- Balances, activity log, edit and delete with Undo.
- Settle-up receipt: exact minimum for up to 12 people with a balance (max zero-sum subsets), greedy beyond; mark paid; UPI deep link; share as PNG and text.
- Share a group as a `#g=` link (deflate + base64url) with a QR code; safe merge on import.
- Offline-first PWA: IndexedDB, Workbox precache including fonts, installable, light and dark themes.
- Vitest suite for splits, remainders, balances, settle-up (property tests), the expression parser and share links.
