import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectImportSource, inspectWorkbook } from '../../src/main/services/workbookInspector';

const createdRoots: string[] = [];

async function createWorkbookFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'people-search-inspector-'));
  createdRoots.push(directory);
  const workbookPath = join(directory, 'fixture.xlsx');
  const workbook = XLSX.utils.book_new();

  const peopleSheet = XLSX.utils.aoa_to_sheet([
    ['People export'],
    ['Person Number', 'First Name', 'Surname', 'Role Name', 'Group', 'County', 'Region'],
    ['1001', 'John', 'Smith', 'Lead', 'North', 'Dublin', 'East']
  ]);

  const donationSheet = XLSX.utils.aoa_to_sheet([
    ['Donor', 'Reference (YP Name)', 'Email', 'Campaign', 'Frequency', 'Status', 'Next Payment Date'],
    ['Jane Doe', 'John Smith', 'john@example.com', 'Spring', 'Monthly', 'Active', '2026-05-01']
  ]);

  XLSX.utils.book_append_sheet(workbook, peopleSheet, 'People');
  XLSX.utils.book_append_sheet(workbook, donationSheet, 'Table1');
  XLSX.writeFile(workbook, workbookPath);

  return workbookPath;
}

async function createPeopleCsvFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'people-search-inspector-csv-'));
  createdRoots.push(directory);
  const csvPath = join(directory, 'people.csv');
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Person Number', 'First Name', 'Surname', 'Role Name', 'Group', 'County', 'Region'],
    ['1001', 'John', 'Smith', 'Lead', 'North', 'Dublin', 'East']
  ]);

  await writeFile(csvPath, XLSX.utils.sheet_to_csv(worksheet), 'utf8');
  return csvPath;
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('inspectWorkbook', () => {
  it('suggests the expected sheets, header rows, and core field mappings', async () => {
    const workbookPath = await createWorkbookFixture();

    const inspection = inspectWorkbook(workbookPath);

    expect(inspection.peopleSuggestion.sheetName).toBe('People');
    expect(inspection.peopleSuggestion.headerRow).toBe(2);
    expect(inspection.peopleSuggestion.fieldMap.personNumber).toBe('Person Number');
    expect(inspection.peopleSuggestion.fieldMap.firstName).toBe('First Name');
    expect(inspection.donationsSuggestion.sheetName).toBe('Table1');
    expect(inspection.donationsSuggestion.headerRow).toBe(1);
    expect(inspection.donationsSuggestion.fieldMap.reference).toBe('Reference (YP Name)');
  });

  it('inspects a csv source file for a single dataset', async () => {
    const csvPath = await createPeopleCsvFixture();

    const inspection = inspectImportSource(csvPath, 'people');

    expect(inspection.dataset).toBe('people');
    expect(inspection.sourceName).toBe('people.csv');
    expect(inspection.sheets).toHaveLength(1);
    expect(inspection.suggestion.headerRow).toBe(1);
    expect(inspection.suggestion.fieldMap.personNumber).toBe('Person Number');
    expect(inspection.suggestion.fieldMap.firstName).toBe('First Name');
    expect(inspection.warnings).toEqual([]);
  });
});