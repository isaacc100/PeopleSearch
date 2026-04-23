# People Search Instructions

## Requirements

- Node.js 22.x or newer
- npm 11.x or newer
- Windows or macOS for desktop packaging

Note: the current dependency tree emits one engine warning on Node 22.11.0 because one ESLint dependency prefers Node 22.13.0 or newer. The app still builds and tests successfully in this workspace.

## Install

```bash
npm install
```

## Run In Development

```bash
npm run dev
```

This starts the Electron desktop shell and the bundled local renderer together.

## Run Tests

```bash
npm test
```

The test suite currently covers:

- session workspace lifecycle
- workbook inspection
- workbook import into the local SQLite database
- deterministic donation linking
- search and linked donation lookups

## Build The App

```bash
npm run build
```

This produces the Electron main process, preload script, and renderer output in `out/`.

## Package Desktop Artifacts

```bash
npm run package
```

Packaging targets are configured for:

- Windows: `nsis`, `portable`
- macOS: `dmg`, `zip`

Unsigned macOS builds may still require manual approval from Gatekeeper.

## How To Use The App

1. Launch the app.
2. Choose a People source file and a Donations source file.
3. If both datasets live in one workbook, choose that workbook for both steps.
4. Review the Import Wizard suggestions for each dataset.
5. Adjust the sheet, header row, and column mappings if needed.
6. Import the selected source files into the local database.
7. Use the `People`, `Donations`, and `Combined` views to search and inspect results.
8. Use `Save Workspace` if you want to keep the imported session.
9. Use `Open Saved` to reopen a saved session folder later.
10. Use `Clear Data` to reset the current session.

## Supported Import Formats

- Excel: `.xlsx`, `.xls`, `.xlsm`, `.xlsb`
- Delimited text: `.csv`, `.tsv`, `.txt`
- OpenDocument: `.ods`

## Expected Source Shape

### People data

- A title row is allowed above the headers.
- The default assumption is headers on row 2.
- CSV and other single-tab files usually use headers on row 1.
- Core fields:
  - Person Number
  - First Name
  - Surname
  - Role Name
  - Group
  - County
  - Region
- Optional field:
  - Email

### Donations data

- The default assumption is headers on row 1.
- CSV and other single-tab files usually use headers on row 1.
- Core fields:
  - Donor
  - Reference (YP Name)
  - Email
- Optional fields:
  - Campaign
  - Frequency
  - Status / Schedule
  - Next Payment Date

## Data Handling

- The original source files are never edited.
- The selected source file or files are copied into the current app workspace.
- Search runs against the local SQLite session database, not against Excel.
- Temporary sessions are deleted on exit unless they are saved.