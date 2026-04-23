# People Search

People Search is a local-only desktop application for importing local spreadsheet or delimited data files and searching two related datasets quickly:

- People data
- Donation or mandate data

The app is built as an Electron desktop shell with a bundled local renderer, source-file inspection and mapping, a disposable local SQLite database, and search views for People, Donations, and linked combined results.

## Current Features

- Cross-platform Electron desktop foundation
- Temporary session workspace with cleanup on exit
- Optional saved workspace folders for reopening later
- Import from one workbook with two sheets or from separate People and Donations files
- Local copies of selected source files in the session workspace
- Source-file inspection with suggested sheet and header row detection
- Manual column mapping for People and Donations imports
- Import into a local SQLite database using `sql.js`
- Deterministic donation linking by unique email first and unique normalized name second
- People search with exact or prefix-first behavior and fuzzy fallback
- Donation search across reference, donor, and email with filters
- Combined view showing a selected person and linked donations
- Sortable, copy-friendly result tables with column toggles

## Project Structure

- `src/main`: Electron main process and local file or database services
- `src/preload`: typed preload bridge exposed to the renderer
- `src/shared`: shared types and field metadata
- `src/renderer/src`: React UI
- `tests/unit`: unit coverage for session, import, linking, and search logic

## Development Commands

```bash
npm install
npm run dev
npm test
npm run build
npm run package
```

More step-by-step usage is documented in [instructions.md](instructions.md).

## Supported Import Formats

- Excel: `.xlsx`, `.xls`, `.xlsm`, `.xlsb`
- Delimited text: `.csv`, `.tsv`, `.txt`
- OpenDocument: `.ods`

You can choose the same workbook for both datasets or use separate files when People and Donations come from different exports.

## Search Behavior

### People search

- Case-insensitive
- Whitespace-tolerant
- Prefix and partial matching first
- Fuzzy fallback only when exact or prefix matches do not produce results
- Filters by role, group, county, and region

### Donation search

- Searches reference, donor, and email
- Case-insensitive
- Prefix and partial matching first
- Fuzzy fallback if needed
- Filters by campaign, frequency, and status

## Data Lifecycle

- Unsaved sessions live in a temporary workspace directory.
- Saved sessions copy the selected source file or files, session metadata, and local database into a user-chosen folder.
- Searches run entirely offline against the imported data.
- The original source files remain unchanged.

## Validation Status

The current codebase has automated unit coverage for:

- workspace session lifecycle
- workbook inspection
- workbook import
- donation linking
- search behavior

The app also builds successfully with `npm run build`.

## Notes

- The current renderer focuses on import, search, and linked inspection rather than editing.
- Cloud features, multi-user support, and write-back to Excel are intentionally out of scope.
- Packaging is configured, but unsigned macOS builds may still require manual approval.