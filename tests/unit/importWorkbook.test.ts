import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { afterEach, describe, expect, it } from 'vitest';
import { openSessionDatabase, queryRows } from '../../src/main/services/database';
import {
  importSourceFilesIntoDatabase,
  importWorkbookIntoDatabase,
  resolveDatabasePath
} from '../../src/main/services/importWorkbook';
import { inspectImportSource, inspectWorkbook } from '../../src/main/services/workbookInspector';
import { WorkspaceManager } from '../../src/main/services/workspaceManager';

const createdRoots: string[] = [];

async function createRoot(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  createdRoots.push(directory);
  return directory;
}

async function createWorkbookFixture(root: string): Promise<string> {
  const workbookPath = join(root, 'fixture.xlsx');
  const workbook = XLSX.utils.book_new();

  const peopleSheet = XLSX.utils.aoa_to_sheet([
    ['People export'],
    ['Person Number', 'First Name', 'Surname', 'Role Name', 'Group', 'County', 'Region'],
    ['1001', 'John', 'Smith', 'Lead', 'North', 'Dublin', 'East'],
    ['1002', 'Joanna', 'Smythe', 'Coordinator', 'South', 'Cork', 'South']
  ]);

  const donationSheet = XLSX.utils.aoa_to_sheet([
    ['Donor', 'Reference (YP Name)', 'Email', 'Campaign', 'Frequency', 'Status', 'Next Payment Date'],
    ['Jane Doe', 'John Smith', 'john@example.com', 'Spring', 'Monthly', 'Active', '2026-05-01'],
    ['Mark Roe', 'Joanna Smythe', 'joanna@example.com', 'Summer', 'Quarterly', 'Paused', '2026-06-15']
  ]);

  XLSX.utils.book_append_sheet(workbook, peopleSheet, 'People');
  XLSX.utils.book_append_sheet(workbook, donationSheet, 'Table1');
  XLSX.writeFile(workbook, workbookPath);

  return workbookPath;
}

async function createPeopleCsvFixture(root: string): Promise<string> {
  const csvPath = join(root, 'people.csv');
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Person Number', 'First Name', 'Surname', 'Role Name', 'Group', 'County', 'Region', 'Email'],
    ['1001', 'John', 'Smith', 'Lead', 'North', 'Dublin', 'East', 'john@example.com'],
    ['1002', 'Joanna', 'Smythe', 'Coordinator', 'South', 'Cork', 'South', 'joanna@example.com']
  ]);

  await writeFile(csvPath, XLSX.utils.sheet_to_csv(worksheet), 'utf8');
  return csvPath;
}

async function createDonationXlsFixture(root: string): Promise<string> {
  const workbookPath = join(root, 'donations.xls');
  const workbook = XLSX.utils.book_new();
  const donationSheet = XLSX.utils.aoa_to_sheet([
    ['Donor', 'Reference (YP Name)', 'Email', 'Campaign', 'Frequency', 'Status', 'Next Payment Date'],
    ['Jane Doe', 'John Smith', 'john@example.com', 'Spring', 'Monthly', 'Active', '2026-05-01'],
    ['Mark Roe', 'Joanna Smythe', 'joanna@example.com', 'Summer', 'Quarterly', 'Paused', '2026-06-15']
  ]);

  XLSX.utils.book_append_sheet(workbook, donationSheet, 'Donations');
  XLSX.writeFile(workbook, workbookPath, { bookType: 'biff8' });

  return workbookPath;
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('importWorkbookIntoDatabase', () => {
  it('imports mapped workbook data into the local SQLite database file', async () => {
    const tempRoot = await createRoot('people-search-temp-');
    const fixtureRoot = await createRoot('people-search-fixture-');
    const workbookPath = await createWorkbookFixture(fixtureRoot);
    const manager = new WorkspaceManager({ appName: 'People Search', tempRoot });
    const session = await manager.getCurrentSession();
    await manager.attachWorkbook(workbookPath);

    const inspection = inspectWorkbook(workbookPath);
    const summary = await importWorkbookIntoDatabase(session.workspacePath, workbookPath, {
      people: {
        sheetName: inspection.peopleSuggestion.sheetName ?? 'People',
        headerRow: inspection.peopleSuggestion.headerRow ?? 2,
        fieldMap: inspection.peopleSuggestion.fieldMap
      },
      donations: {
        sheetName: inspection.donationsSuggestion.sheetName ?? 'Table1',
        headerRow: inspection.donationsSuggestion.headerRow ?? 1,
        fieldMap: inspection.donationsSuggestion.fieldMap
      }
    });

    expect(summary.peopleCount).toBe(2);
    expect(summary.donationCount).toBe(2);
    expect(summary.linkedDonationCount).toBe(2);
    expect(existsSync(resolveDatabasePath(session.workspacePath))).toBe(true);

    const { db } = await openSessionDatabase(session.workspacePath);

    try {
      const peopleRows = queryRows<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM people');
      const donationRows = queryRows<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM donations');

      expect(Number(peopleRows[0].total)).toBe(2);
      expect(Number(donationRows[0].total)).toBe(2);
    } finally {
      db.close();
    }
  });

  it('imports people and donations from separate csv and xls source files', async () => {
    const tempRoot = await createRoot('people-search-temp-');
    const fixtureRoot = await createRoot('people-search-fixture-');
    const peopleCsvPath = await createPeopleCsvFixture(fixtureRoot);
    const donationXlsPath = await createDonationXlsFixture(fixtureRoot);
    const manager = new WorkspaceManager({ appName: 'People Search', tempRoot });
    const session = await manager.getCurrentSession();

    await manager.attachImportSource('people', peopleCsvPath);
    await manager.attachImportSource('donations', donationXlsPath);

    const peopleInspection = inspectImportSource(peopleCsvPath, 'people');
    const donationInspection = inspectImportSource(donationXlsPath, 'donations');
    const summary = await importSourceFilesIntoDatabase(
      session.workspacePath,
      {
        people: await manager.resolveCurrentImportSourcePath('people'),
        donations: await manager.resolveCurrentImportSourcePath('donations')
      },
      {
        people: {
          sheetName: peopleInspection.suggestion.sheetName ?? peopleInspection.sheets[0]?.name ?? '',
          headerRow: peopleInspection.suggestion.headerRow ?? 1,
          fieldMap: peopleInspection.suggestion.fieldMap
        },
        donations: {
          sheetName: donationInspection.suggestion.sheetName ?? donationInspection.sheets[0]?.name ?? '',
          headerRow: donationInspection.suggestion.headerRow ?? 1,
          fieldMap: donationInspection.suggestion.fieldMap
        }
      }
    );

    expect(summary.peopleCount).toBe(2);
    expect(summary.donationCount).toBe(2);
    expect(summary.linkedDonationCount).toBe(2);
    expect(existsSync(resolveDatabasePath(session.workspacePath))).toBe(true);

    const { db } = await openSessionDatabase(session.workspacePath);

    try {
      const peopleRows = queryRows<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM people');
      const donationRows = queryRows<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM donations');

      expect(Number(peopleRows[0].total)).toBe(2);
      expect(Number(donationRows[0].total)).toBe(2);
    } finally {
      db.close();
    }
  });
});