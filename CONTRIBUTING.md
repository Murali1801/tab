# Contributing

Thanks for helping with Tab, an offline-first bill-splitting PWA with no account and no server. Issues, ideas and pull requests are all welcome.

## Getting started

You need Node 22.18 or newer.

```bash
git clone https://github.com/Murali1801/tab.git
cd tab
npm install
npm run dev
```

Before you open a pull request:

```bash
npm test
npm run build
```

Both run in CI on every pull request.

## Where things live

- `src/core/` is pure logic: money in integer paise, split methods, balances, settle-up, the expression parser and share-link encoding. Tests are in `test/`.
- `src/state/` keeps the store and IndexedDB access.
- `src/screens/`, `src/sheets/` and `src/ui/` are the Preact interface. `src/ui/sheet.ts` is the one place bottom sheets are opened.

## Project rules

- Money is always integer minor units. No floats for amounts, and totals must still add up exactly.
- Never use `eval` or `Function` for the keypad; extend the parser instead.
- Group data must never leave the device except inside a share link's `#` fragment.
- Check that the app still works in airplane mode after your change.

## Good first issues

Issues labelled [good first issue](https://github.com/Murali1801/tab/labels/good%20first%20issue) are small and self-contained. Comment on one before you start so two people don't pick the same thing.

## Pull requests

- One change per pull request, with a short description of what and why.
- Add or update tests when you change logic.
- Screenshots or a short screen recording help for anything visual.

## Code of conduct

Be kind and assume good intent. Harassment or personal attacks aren't tolerated.
