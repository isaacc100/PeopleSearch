import {
  DATASET_LABELS,
  createEmptyDonationFieldMap,
  createEmptyPeopleFieldMap,
  type DatasetKey,
  type DonationImportSourceInspection,
  type DatasetSuggestion,
  type DonationFieldKey,
  DONATION_REQUIRED_FIELDS,
  type ImportSourceInspection,
  type PeopleFieldKey,
  type PeopleImportSourceInspection,
  PEOPLE_REQUIRED_FIELDS,
  suggestDonationFieldMap,
  suggestPeopleFieldMap,
  type SheetHeaderCandidate,
  type SheetInspection,
  type WorkbookInspection
} from '../../shared/types';
import { XLSX } from './xlsxCompat';

const MAX_PREVIEW_ROWS = 8;
const MAX_HEADER_ROWS = 5;

interface CandidateScore<FieldKey extends string> {
  fieldMap: Record<FieldKey, string | null>;
  confidence: number;
}

export function inspectWorkbook(workbookPath: string): WorkbookInspection {
  const { sourceName, sheets } = inspectSourceSheets(workbookPath);

  const peopleSuggestion = buildSuggestion<PeopleFieldKey>(
    sheets,
    PEOPLE_REQUIRED_FIELDS,
    createEmptyPeopleFieldMap,
    (columns) => scorePeopleColumns(columns)
  );
  const donationsSuggestion = buildSuggestion<DonationFieldKey>(
    sheets,
    DONATION_REQUIRED_FIELDS,
    createEmptyDonationFieldMap,
    (columns) => scoreDonationColumns(columns)
  );

  const warnings: string[] = [];

  if (!peopleSuggestion.sheetName) {
    warnings.push('Could not confidently detect the People sheet. Please map it manually.');
  }

  if (!donationsSuggestion.sheetName) {
    warnings.push('Could not confidently detect the Donations sheet. Please map it manually.');
  }

  return {
    workbookName: sourceName,
    sheets,
    peopleSuggestion,
    donationsSuggestion,
    warnings
  };
}

export function inspectImportSource(
  sourcePath: string,
  dataset: 'people'
): PeopleImportSourceInspection;
export function inspectImportSource(
  sourcePath: string,
  dataset: 'donations'
): DonationImportSourceInspection;
export function inspectImportSource(sourcePath: string, dataset: DatasetKey): ImportSourceInspection {
  const { sourceName, sheets } = inspectSourceSheets(sourcePath);
  const warnings: string[] = [];

  if (dataset === 'people') {
    const suggestion = buildSuggestion<PeopleFieldKey>(
      sheets,
      PEOPLE_REQUIRED_FIELDS,
      createEmptyPeopleFieldMap,
      (columns) => scorePeopleColumns(columns)
    );

    if (!suggestion.sheetName) {
      warnings.push(`Could not confidently detect the ${DATASET_LABELS.people} sheet. Please map it manually.`);
    }

    return {
      dataset,
      sourceName,
      sheets,
      suggestion,
      warnings
    };
  }

  const suggestion = buildSuggestion<DonationFieldKey>(
    sheets,
    DONATION_REQUIRED_FIELDS,
    createEmptyDonationFieldMap,
    (columns) => scoreDonationColumns(columns)
  );

  if (!suggestion.sheetName) {
    warnings.push(`Could not confidently detect the ${DATASET_LABELS.donations} sheet. Please map it manually.`);
  }

  return {
    dataset,
    sourceName,
    sheets,
    suggestion,
    warnings
  };
}

function inspectSourceSheets(sourcePath: string): { sourceName: string; sheets: SheetInspection[] } {
  const workbook = XLSX.readFile(sourcePath, {
    raw: false,
    cellDates: true,
    dense: true
  });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false
    });

    return buildSheetInspection(sheetName, rows);
  });

  return {
    sourceName: sourcePath.split(/[/\\]/).pop() ?? 'source-file',
    sheets
  };
}

function buildSheetInspection(sheetName: string, rows: string[][]): SheetInspection {
  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS).map((row) => row.map((value) => String(value ?? '')));
  const headerCandidates: SheetHeaderCandidate[] = [];

  for (let index = 0; index < Math.min(rows.length, MAX_HEADER_ROWS); index += 1) {
    const columns = buildColumnsFromRow(rows[index] ?? []);

    if (columns.length < 2) {
      continue;
    }

    headerCandidates.push({
      rowNumber: index + 1,
      columns,
      peopleConfidence: scorePeopleColumns(columns).confidence,
      donationConfidence: scoreDonationColumns(columns).confidence
    });
  }

  return {
    name: sheetName,
    previewRows,
    rowCount: rows.length,
    headerCandidates
  };
}

function buildSuggestion<FieldKey extends string>(
  sheets: SheetInspection[],
  requiredFields: readonly FieldKey[],
  createEmptyFieldMap: () => Record<FieldKey, string | null>,
  scoreColumns: (columns: string[]) => CandidateScore<FieldKey>
): DatasetSuggestion<FieldKey> {
  let bestSuggestion: DatasetSuggestion<FieldKey> = {
    sheetName: null,
    headerRow: null,
    fieldMap: createEmptyFieldMap(),
    confidence: 0
  };

  for (const sheet of sheets) {
    for (const candidate of sheet.headerCandidates) {
      const scoredCandidate = scoreColumns(candidate.columns);

      if (scoredCandidate.confidence > bestSuggestion.confidence) {
        bestSuggestion = {
          sheetName: sheet.name,
          headerRow: candidate.rowNumber,
          fieldMap: scoredCandidate.fieldMap,
          confidence: scoredCandidate.confidence
        };
      }
    }
  }

  const matchedRequiredFieldCount = requiredFields.filter(
    (field) => bestSuggestion.fieldMap[field] !== null
  ).length;

  if (matchedRequiredFieldCount === 0) {
    return {
      sheetName: null,
      headerRow: null,
      fieldMap: createEmptyFieldMap(),
      confidence: 0
    };
  }

  return bestSuggestion;
}

function scorePeopleColumns(columns: string[]): CandidateScore<PeopleFieldKey> {
  const fieldMap = suggestPeopleFieldMap(columns);
  const matchedRequiredCount = PEOPLE_REQUIRED_FIELDS.filter((field) => fieldMap[field]).length;
  return {
    fieldMap,
    confidence: matchedRequiredCount / PEOPLE_REQUIRED_FIELDS.length
  };
}

function scoreDonationColumns(columns: string[]): CandidateScore<DonationFieldKey> {
  const fieldMap = suggestDonationFieldMap(columns);
  const matchedRequiredCount = DONATION_REQUIRED_FIELDS.filter((field) => fieldMap[field]).length;
  return {
    fieldMap,
    confidence: matchedRequiredCount / DONATION_REQUIRED_FIELDS.length
  };
}

function buildColumnsFromRow(row: string[]): string[] {
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