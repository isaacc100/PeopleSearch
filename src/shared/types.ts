export type SessionMode = 'temporary' | 'saved';

export type SessionDataState = 'empty' | 'staged' | 'ready';

export const PEOPLE_REQUIRED_FIELDS = [
  'personNumber',
  'firstName',
  'surname',
  'roleName',
  'group',
  'county',
  'region'
] as const;

export const PEOPLE_OPTIONAL_FIELDS = ['email'] as const;

export const DONATION_REQUIRED_FIELDS = ['donor', 'reference', 'email'] as const;

export const DONATION_OPTIONAL_FIELDS = [
  'campaign',
  'frequency',
  'status',
  'nextPaymentDate'
] as const;

export const PEOPLE_FIELDS = [...PEOPLE_REQUIRED_FIELDS, ...PEOPLE_OPTIONAL_FIELDS] as const;
export const DONATION_FIELDS = [...DONATION_REQUIRED_FIELDS, ...DONATION_OPTIONAL_FIELDS] as const;

export type PeopleFieldKey = (typeof PEOPLE_FIELDS)[number];
export type DonationFieldKey = (typeof DONATION_FIELDS)[number];
export const DATASET_KEYS = ['people', 'donations'] as const;
export type DatasetKey = (typeof DATASET_KEYS)[number];
export type LinkBasis = 'none' | 'email' | 'reference' | 'ambiguous';

export const DATASET_LABELS: Record<DatasetKey, string> = {
  people: 'Young People',
  donations: 'Youth Subs'
};

export const FIELD_LABELS: Record<PeopleFieldKey | DonationFieldKey, string> = {
  personNumber: 'Person Number',
  firstName: 'First Name',
  surname: 'Surname',
  roleName: 'Role Name',
  group: 'Group',
  county: 'County',
  region: 'Region',
  email: 'Email',
  donor: 'Donor',
  reference: 'Reference (YP Name)',
  campaign: 'Campaign',
  frequency: 'Frequency',
  status: 'Status / Schedule',
  nextPaymentDate: 'Next Payment Date'
};

const FIELD_ALIASES: Record<PeopleFieldKey | DonationFieldKey, string[]> = {
  personNumber: ['person number', 'person no', 'person id', 'person #'],
  firstName: ['first name', 'firstname', 'forename'],
  surname: ['surname', 'last name', 'lastname', 'family name'],
  roleName: ['role name', 'role', 'position', 'job title'],
  group: ['group', 'team', 'department'],
  county: ['county'],
  region: ['region', 'area'],
  email: ['email', 'e-mail', 'email address'],
  donor: ['donor', 'payer', 'supporter', 'name'],
  reference: ['reference', 'yp name', 'reference (yp name)', 'young person name'],
  campaign: ['campaign', 'appeal', 'fund'],
  frequency: ['frequency', 'payment frequency'],
  status: ['status', 'schedule', 'payment status', 'mandate status'],
  nextPaymentDate: ['next payment', 'next payment date', 'payment date', 'next collection date']
};

export interface ImportSummary {
  peopleCount: number;
  donationCount: number;
  linkedDonationCount: number;
  warnings: string[];
}

export type DatasetSourceFiles = Partial<Record<DatasetKey, string>>;

export interface AppSession {
  id: string;
  mode: SessionMode;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
  dataState: SessionDataState;
  sourceFiles?: DatasetSourceFiles;
  workbookName?: string;
  databasePath?: string;
  importedAt?: string;
  summary?: ImportSummary;
}

export interface SaveSessionResult {
  canceled: boolean;
  session: AppSession;
}

export interface OpenSessionResult {
  canceled: boolean;
  session: AppSession;
}

export interface WorkbookSelectionResult {
  canceled: boolean;
  session: AppSession;
}

export interface ImportSourceSelectionResult {
  canceled: boolean;
  dataset: DatasetKey;
  session: AppSession;
}

export interface SheetHeaderCandidate {
  rowNumber: number;
  columns: string[];
  peopleConfidence: number;
  donationConfidence: number;
}

export interface SheetInspection {
  name: string;
  previewRows: string[][];
  rowCount: number;
  headerCandidates: SheetHeaderCandidate[];
}

export interface DatasetSuggestion<FieldKey extends string> {
  sheetName: string | null;
  headerRow: number | null;
  fieldMap: Record<FieldKey, string | null>;
  confidence: number;
}

export interface WorkbookInspection {
  workbookName: string;
  sheets: SheetInspection[];
  peopleSuggestion: DatasetSuggestion<PeopleFieldKey>;
  donationsSuggestion: DatasetSuggestion<DonationFieldKey>;
  warnings: string[];
}

export interface DatasetSourceInspection<FieldKey extends string, Key extends DatasetKey = DatasetKey> {
  dataset: Key;
  sourceName: string;
  sheets: SheetInspection[];
  suggestion: DatasetSuggestion<FieldKey>;
  warnings: string[];
}

export type PeopleImportSourceInspection = DatasetSourceInspection<PeopleFieldKey, 'people'>;
export type DonationImportSourceInspection = DatasetSourceInspection<DonationFieldKey, 'donations'>;
export type ImportSourceInspection = PeopleImportSourceInspection | DonationImportSourceInspection;

export interface DatasetImportConfig<FieldKey extends string> {
  sheetName: string;
  headerRow: number;
  fieldMap: Record<FieldKey, string | null>;
}

export interface ImportConfiguration {
  people: DatasetImportConfig<PeopleFieldKey>;
  donations: DatasetImportConfig<DonationFieldKey>;
}

export type ImportSourcePaths = Record<DatasetKey, string>;

export interface ImportExecutionResult {
  session: AppSession;
  summary: ImportSummary;
}

export interface PeopleFilters {
  roleName?: string;
  group?: string;
  county?: string;
  region?: string;
}

export interface DonationFilters {
  campaign?: string;
  frequency?: string;
  status?: string;
  nextPaymentFrom?: string;
  nextPaymentTo?: string;
}

export interface PeopleSearchQuery {
  text: string;
  filters: PeopleFilters;
  limit?: number;
}

export interface DonationSearchQuery {
  text: string;
  filters: DonationFilters;
  limit?: number;
}

export interface PersonSearchResult {
  id: string;
  personNumber: string | null;
  firstName: string | null;
  surname: string | null;
  fullName: string;
  email: string | null;
  roleName: string | null;
  group: string | null;
  county: string | null;
  region: string | null;
  linkedDonationCount: number;
}

export interface DonationSearchResult {
  id: string;
  donor: string | null;
  reference: string | null;
  email: string | null;
  campaign: string | null;
  frequency: string | null;
  status: string | null;
  nextPaymentDate: string | null;
  linkedPersonId: string | null;
  linkBasis: LinkBasis;
  linkScore: number;
}

export interface SearchBootstrap {
  summary: ImportSummary | null;
  peopleCount: number;
  donationCount: number;
  roleNames: string[];
  groups: string[];
  counties: string[];
  regions: string[];
  campaigns: string[];
  frequencies: string[];
  statuses: string[];
}

export interface WorkbookFieldMapping {
  people: Record<PeopleFieldKey, string | null>;
  donations: Record<DonationFieldKey, string | null>;
}

function normalizeHeaderCandidate(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function suggestFieldFromColumns<FieldKey extends string>(
  columns: string[],
  fields: readonly FieldKey[]
): Record<FieldKey, string | null> {
  const normalizedColumns = columns.map((column) => ({
    original: column,
    normalized: normalizeHeaderCandidate(column)
  }));

  const usedColumns = new Set<string>();
  const result = {} as Record<FieldKey, string | null>;

  for (const field of fields) {
    const aliases = FIELD_ALIASES[field as keyof typeof FIELD_ALIASES] ?? [];
    let chosenColumn: string | null = null;
    let chosenScore = 0;

    for (const column of normalizedColumns) {
      if (usedColumns.has(column.original)) {
        continue;
      }

      for (const alias of aliases) {
        const normalizedAlias = normalizeHeaderCandidate(alias);
        let score = 0;

        if (column.normalized === normalizedAlias) {
          score = 4;
        } else if (column.normalized.startsWith(normalizedAlias)) {
          score = 3;
        } else if (column.normalized.includes(normalizedAlias) || normalizedAlias.includes(column.normalized)) {
          score = 2;
        }

        if (score > chosenScore) {
          chosenScore = score;
          chosenColumn = column.original;
        }
      }
    }

    result[field] = chosenColumn;

    if (chosenColumn) {
      usedColumns.add(chosenColumn);
    }
  }

  return result;
}

export function createEmptyPeopleFieldMap(): Record<PeopleFieldKey, string | null> {
  return Object.fromEntries(PEOPLE_FIELDS.map((field) => [field, null])) as Record<
    PeopleFieldKey,
    string | null
  >;
}

export function createEmptyDonationFieldMap(): Record<DonationFieldKey, string | null> {
  return Object.fromEntries(DONATION_FIELDS.map((field) => [field, null])) as Record<
    DonationFieldKey,
    string | null
  >;
}

export function suggestPeopleFieldMap(columns: string[]): Record<PeopleFieldKey, string | null> {
  return suggestFieldFromColumns(columns, PEOPLE_FIELDS);
}

export function suggestDonationFieldMap(columns: string[]): Record<DonationFieldKey, string | null> {
  return suggestFieldFromColumns(columns, DONATION_FIELDS);
}

export interface DesktopApi {
  session: {
    getCurrent: () => Promise<AppSession>;
    save: () => Promise<SaveSessionResult>;
    openSaved: () => Promise<OpenSessionResult>;
    clear: () => Promise<AppSession>;
  };
  imports: {
    selectWorkbook: () => Promise<WorkbookSelectionResult>;
    inspectCurrentWorkbook: () => Promise<WorkbookInspection>;
    selectImportSource: (dataset: DatasetKey) => Promise<ImportSourceSelectionResult>;
    inspectImportSource: (dataset: DatasetKey) => Promise<ImportSourceInspection>;
    runImport: (config: ImportConfiguration) => Promise<ImportExecutionResult>;
  };
  search: {
    getBootstrap: () => Promise<SearchBootstrap>;
    searchPeople: (query: PeopleSearchQuery) => Promise<PersonSearchResult[]>;
    searchDonations: (query: DonationSearchQuery) => Promise<DonationSearchResult[]>;
    getLinkedDonations: (personId: string) => Promise<DonationSearchResult[]>;
  };
}

export function getSessionSourceFileName(
  session: AppSession | null | undefined,
  dataset: DatasetKey
): string | undefined {
  if (!session) {
    return undefined;
  }

  return session.sourceFiles?.[dataset] ?? session.workbookName;
}