# Changelog

All notable changes to People Search are documented here.

---

## [1.1.0] - 2026-04-24

### Changed
- Updated app title to **PeopleSearch** and subtitle to reflect the actual dataset names.
- Renamed **Import Wizard** section to **Load Your Data** with updated instructional copy.
- Renamed source card labels: People Source → Young People File, Donations Source → Youth Subs File.
- Renamed status labels: Inspection → Field Mapping, Imported rows → Import Status.
- Updated "No file selected" placeholder to **No file loaded** and "No imported data yet" to **No data imported**.
- Renamed buttons: Choose People File → Select Young People File, Choose Donations File → Select Youth Subs File.
- Updated segmented control and search workspace stats to use **Young People** / **Youth Subs**.
- Renamed views section eyebrow from **Next Up** to **Search & Views**.
- Updated view cards (Young People, Youth Subs, Combined) with user-facing descriptions.
- Updated `DATASET_LABELS` in shared types to "Young People" and "Youth Subs".

### Added
- **How it works** instructional block below the import section with four sequential steps.
- Visible note: **Both files must be loaded before importing.**

---



### Security
- Replaced `xlsx` npm package (0.18.5) with SheetJS Community Edition 0.20.3 from the
  authoritative CDN (`https://cdn.sheetjs.com`), resolving two security advisories:
  - GHSA-5pgg-2g8v-p4x9 — Regular Expression Denial of Service (ReDoS) in SheetJS
  - GHSA-4r6h-8v6p-xvw6 — Prototype Pollution in SheetJS
- The API is fully backwards-compatible; no source changes were required.
- Run `npm install` after pulling this change to apply the fix.

---

## [1.0.0] - 2026-04-23

First stable release.

### Changed
- Promoted from pre-release `0.1.0` to stable `1.0.0`.

---

## [0.1.0] - Initial pre-release

### Added

**Import Wizard**
- Multi-format source file support: `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.csv`, `.tsv`, `.txt`, `.ods`.
- Auto-detection of sheet, header row, and column mappings for both People and Donations datasets.
- Manual override of sheet selection, header row, and all column mappings before committing the import.
- Source files are copied into the session workspace; originals are never modified.

**People data**
- Imports core fields: Person Number, First Name, Surname, Role Name, Group, County, Region.
- Optional Email field support.
- Tolerates a title row above the header row (default header on row 2; row 1 for single-tab files).

**Donations data**
- Imports core fields: Donor, Reference (YP Name), Email.
- Optional fields: Campaign, Frequency, Status / Schedule, Next Payment Date.
- Default header on row 1.

**Deterministic donation linking**
- `linkService` matches donation records to people records using name and email normalisation.

**Search**
- Fast full-text search against the local SQLite session database (not against source files).
- People, Donations, and Combined views with virtualized data tables for large datasets.

**Workspace management**
- Temporary sessions are cleared on exit unless explicitly saved.
- `Save Workspace` persists the current session to a named folder.
- `Open Saved` reopens a previously saved session.
- `Clear Data` resets the active session.

**Packaging**
- Windows targets: NSIS installer and portable executable.
- macOS targets: DMG and ZIP archive.

**Testing**
- Unit test coverage for: session workspace lifecycle, workbook inspection, workbook import, donation linking, search and linked donation lookups.
