import { randomUUID } from 'node:crypto';
import {
  type DatasetImportConfig,
  type DonationFieldKey,
  DONATION_REQUIRED_FIELDS,
  type ImportConfiguration,
  type ImportSourcePaths,
  type ImportSummary,
  type PeopleFieldKey,
  PEOPLE_REQUIRED_FIELDS
} from '../../shared/types';
import {
  getDatabasePath,
  openSessionDatabase,
  persistSessionDatabase,
  queryRows
} from './database';
import { linkDatabaseRecords } from './linkService';
import { buildFullName, normalizeSearchText, parseDateString, stringOrNull } from './normalization';
import { XLSX } from './xlsxCompat';

interface ImportedPersonRow {
  id: string;
  personNumber: string | null;
  firstName: string | null;
  surname: string | null;
  fullName: string;
  normalizedFullName: string;
  email: string | null;
  normalizedEmail: string | null;
  roleName: string | null;
  groupName: string | null;
  county: string | null;
  region: string | null;
  rawValues: Record<string, string>;
}

interface ImportedDonationRow {
  id: string;
  donor: string | null;
  reference: string | null;
  email: string | null;
  normalizedDonor: string | null;
  normalizedReference: string | null;
  normalizedEmail: string | null;
  campaign: string | null;
  frequency: string | null;
  status: string | null;
  nextPaymentDate: string | null;
  rawValues: Record<string, string>;
}

export async function importWorkbookIntoDatabase(
  workspacePath: string,
  workbookPath: string,
  config: ImportConfiguration
): Promise<ImportSummary> {
  return importSourceFilesIntoDatabase(
    workspacePath,
    {
      people: workbookPath,
      donations: workbookPath
    },
    config
  );
}

export async function importSourceFilesIntoDatabase(
  workspacePath: string,
  sourcePaths: ImportSourcePaths,
  config: ImportConfiguration
): Promise<ImportSummary> {
  const peopleWorkbook = readWorkbook(sourcePaths.people);
  const donationWorkbook =
    sourcePaths.donations === sourcePaths.people ? peopleWorkbook : readWorkbook(sourcePaths.donations);

  const warnings: string[] = [];
  const { db, dbPath } = await openSessionDatabase(workspacePath);

  try {
    const peopleRows = buildPeopleRows(peopleWorkbook, config.people, warnings);
    const donationRows = buildDonationRows(donationWorkbook, config.donations, warnings);

    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM donations');
    db.run('DELETE FROM people');
    db.run('DELETE FROM import_metadata');

    const personStatement = db.prepare(`
      INSERT INTO people (
        id,
        person_number,
        first_name,
        surname,
        full_name,
        normalized_full_name,
        email,
        normalized_email,
        role_name,
        group_name,
        county,
        region,
        raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      for (const row of peopleRows) {
        personStatement.run([
          row.id,
          row.personNumber,
          row.firstName,
          row.surname,
          row.fullName,
          row.normalizedFullName,
          row.email,
          row.normalizedEmail,
          row.roleName,
          row.groupName,
          row.county,
          row.region,
          JSON.stringify(row.rawValues)
        ]);
      }
    } finally {
      personStatement.free();
    }

    const donationStatement = db.prepare(`
      INSERT INTO donations (
        id,
        donor,
        reference,
        email,
        normalized_donor,
        normalized_reference,
        normalized_email,
        campaign,
        frequency,
        status,
        next_payment_date,
        raw_json,
        linked_person_id,
        link_basis,
        link_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'none', 0)
    `);

    try {
      for (const row of donationRows) {
        donationStatement.run([
          row.id,
          row.donor,
          row.reference,
          row.email,
          row.normalizedDonor,
          row.normalizedReference,
          row.normalizedEmail,
          row.campaign,
          row.frequency,
          row.status,
          row.nextPaymentDate,
          JSON.stringify(row.rawValues)
        ]);
      }
    } finally {
      donationStatement.free();
    }

    const linkedDonationCount = linkDatabaseRecords(db);
    const importedAt = new Date().toISOString();
    db.run(
      `
        INSERT INTO import_metadata (
          id,
          workbook_name,
          people_sheet,
          people_header_row,
          donations_sheet,
          donations_header_row,
          people_count,
          donation_count,
          linked_donation_count,
          imported_at,
          mapping_json,
          warnings_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        1,
        buildImportSourceLabel(sourcePaths),
        config.people.sheetName,
        config.people.headerRow,
        config.donations.sheetName,
        config.donations.headerRow,
        peopleRows.length,
        donationRows.length,
        linkedDonationCount,
        importedAt,
        JSON.stringify(config),
        JSON.stringify(warnings)
      ]
    );
    db.run('COMMIT');

    await persistSessionDatabase(db, dbPath);

    return {
      peopleCount: peopleRows.length,
      donationCount: donationRows.length,
      linkedDonationCount,
      warnings
    };
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

export async function readImportMetadata(workspacePath: string): Promise<ImportSummary | null> {
  const { db } = await openSessionDatabase(workspacePath);

  try {
    const rows = queryRows<{
      people_count: number;
      donation_count: number;
      linked_donation_count: number;
      warnings_json: string;
    }>(
      db,
      `
        SELECT people_count, donation_count, linked_donation_count, warnings_json
        FROM import_metadata
        WHERE id = 1
      `
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      peopleCount: Number(row.people_count),
      donationCount: Number(row.donation_count),
      linkedDonationCount: Number(row.linked_donation_count),
      warnings: JSON.parse(String(row.warnings_json)) as string[]
    };
  } finally {
    db.close();
  }
}

export function resolveDatabasePath(workspacePath: string): string {
  return getDatabasePath(workspacePath);
}

function readWorkbook(sourcePath: string): XLSX.WorkBook {
  return XLSX.readFile(sourcePath, {
    raw: false,
    cellDates: true,
    dense: true
  });
}

function buildImportSourceLabel(sourcePaths: ImportSourcePaths): string {
  const peopleSourceName = getSourceName(sourcePaths.people);
  const donationSourceName = getSourceName(sourcePaths.donations);

  if (peopleSourceName === donationSourceName) {
    return peopleSourceName;
  }

  return `${peopleSourceName} + ${donationSourceName}`;
}

function getSourceName(sourcePath: string): string {
  return sourcePath.split(/[/\\]/).pop() ?? 'source-file';
}

function buildPeopleRows(
  workbook: XLSX.WorkBook,
  config: DatasetImportConfig<PeopleFieldKey>,
  warnings: string[]
): ImportedPersonRow[] {
  const sheetRows = readSheetRows(workbook, config.sheetName);
  const { columns, dataRows } = resolveConfiguredRows(sheetRows, config);
  validateRequiredFields('People', columns, config.fieldMap, PEOPLE_REQUIRED_FIELDS);

  const importedRows = dataRows
    .map((row) => buildRawRow(columns, row))
    .map((rawRow) => {
      const personNumber = getMappedValue(rawRow, config.fieldMap.personNumber);
      const firstName = getMappedValue(rawRow, config.fieldMap.firstName);
      const surname = getMappedValue(rawRow, config.fieldMap.surname);
      const fullName = buildFullName(firstName, surname);

      return {
        id: randomUUID(),
        personNumber,
        firstName,
        surname,
        fullName,
        normalizedFullName: normalizeSearchText(fullName),
        email: getMappedValue(rawRow, config.fieldMap.email),
        normalizedEmail: normalizeNullableSearchValue(getMappedValue(rawRow, config.fieldMap.email)),
        roleName: getMappedValue(rawRow, config.fieldMap.roleName),
        groupName: getMappedValue(rawRow, config.fieldMap.group),
        county: getMappedValue(rawRow, config.fieldMap.county),
        region: getMappedValue(rawRow, config.fieldMap.region),
        rawValues: rawRow
      } satisfies ImportedPersonRow;
    })
    .filter((row) => {
      const isMeaningful = Boolean(row.personNumber || row.fullName);

      if (!isMeaningful) {
        warnings.push('Skipped a People row that had neither a person number nor a full name.');
      }

      return isMeaningful;
    });

  return importedRows;
}

function buildDonationRows(
  workbook: XLSX.WorkBook,
  config: DatasetImportConfig<DonationFieldKey>,
  warnings: string[]
): ImportedDonationRow[] {
  const sheetRows = readSheetRows(workbook, config.sheetName);
  const { columns, dataRows } = resolveConfiguredRows(sheetRows, config);
  validateRequiredFields('Donations', columns, config.fieldMap, DONATION_REQUIRED_FIELDS);

  const importedRows = dataRows
    .map((row) => buildRawRow(columns, row))
    .map((rawRow) => {
      const donor = getMappedValue(rawRow, config.fieldMap.donor);
      const reference = getMappedValue(rawRow, config.fieldMap.reference);
      const email = getMappedValue(rawRow, config.fieldMap.email);

      return {
        id: randomUUID(),
        donor,
        reference,
        email,
        normalizedDonor: normalizeNullableSearchValue(donor),
        normalizedReference: normalizeNullableSearchValue(reference),
        normalizedEmail: normalizeNullableSearchValue(email),
        campaign: getMappedValue(rawRow, config.fieldMap.campaign),
        frequency: getMappedValue(rawRow, config.fieldMap.frequency),
        status: getMappedValue(rawRow, config.fieldMap.status),
        nextPaymentDate: parseDateString(getMappedValue(rawRow, config.fieldMap.nextPaymentDate)),
        rawValues: rawRow
      } satisfies ImportedDonationRow;
    })
    .filter((row) => {
      const isMeaningful = Boolean(row.reference || row.donor || row.email);

      if (!isMeaningful) {
        warnings.push('Skipped a Donation row that had no donor, reference, or email.');
      }

      return isMeaningful;
    });

  return importedRows;
}

function readSheetRows(workbook: XLSX.WorkBook, sheetName: string): string[][] {
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`The sheet "${sheetName}" was not found in the workbook.`);
  }

  return XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false
  });
}

function resolveConfiguredRows<FieldKey extends string>(
  sheetRows: string[][],
  config: DatasetImportConfig<FieldKey>
): { columns: string[]; dataRows: string[][] } {
  const headerRowIndex = config.headerRow - 1;
  const headerRow = sheetRows[headerRowIndex];

  if (!headerRow) {
    throw new Error(`Header row ${config.headerRow} could not be found.`);
  }

  const columns = buildColumnsFromHeaderRow(headerRow);
  const dataRows = sheetRows.slice(headerRowIndex + 1);

  return { columns, dataRows };
}

function buildColumnsFromHeaderRow(row: string[]): string[] {
  const seenColumns = new Map<string, number>();
  const columns: string[] = [];

  for (const rawValue of row) {
    const trimmedValue = String(rawValue ?? '').trim();

    if (!trimmedValue) {
      continue;
    }

    const seenCount = seenColumns.get(trimmedValue) ?? 0;
    seenColumns.set(trimmedValue, seenCount + 1);
    columns.push(seenCount === 0 ? trimmedValue : `${trimmedValue} (${seenCount + 1})`);
  }

  return columns;
}

function buildRawRow(columns: string[], row: string[]): Record<string, string> {
  return Object.fromEntries(
    columns.map((column, index) => [column, String(row[index] ?? '').trim()])
  ) as Record<string, string>;
}

function getMappedValue(rawRow: Record<string, string>, mappedColumn: string | null): string | null {
  if (!mappedColumn) {
    return null;
  }

  return stringOrNull(rawRow[mappedColumn]);
}

function normalizeNullableSearchValue(value: string | null): string | null {
  return value ? normalizeSearchText(value) : null;
}

function validateRequiredFields<FieldKey extends string>(
  datasetLabel: string,
  columns: string[],
  fieldMap: Record<FieldKey, string | null>,
  requiredFields: readonly FieldKey[]
): void {
  for (const field of requiredFields) {
    const mappedColumn = fieldMap[field];

    if (!mappedColumn) {
      throw new Error(`${datasetLabel} mapping is missing a required field: ${String(field)}.`);
    }

    if (!columns.includes(mappedColumn)) {
      throw new Error(
        `${datasetLabel} mapping refers to a column that does not exist in the selected header row: ${mappedColumn}.`
      );
    }
  }
}