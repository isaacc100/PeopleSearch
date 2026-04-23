import type { Database } from 'sql.js';
import type {
  DonationSearchQuery,
  DonationSearchResult,
  PersonSearchResult,
  PeopleSearchQuery,
  SearchBootstrap
} from '../../shared/types';
import { openSessionDatabase, queryRows } from './database';
import { normalizeSearchText, scoreFuzzyMatch, tokenizeSearchText } from './normalization';

const DEFAULT_LIMIT = 200;

interface PersonDatabaseRow {
  id: string;
  person_number: string | null;
  first_name: string | null;
  surname: string | null;
  full_name: string;
  email: string | null;
  role_name: string | null;
  group_name: string | null;
  county: string | null;
  region: string | null;
  linked_donation_count: number;
}

interface DonationDatabaseRow {
  id: string;
  donor: string | null;
  reference: string | null;
  email: string | null;
  campaign: string | null;
  frequency: string | null;
  status: string | null;
  next_payment_date: string | null;
  linked_person_id: string | null;
  link_basis: 'none' | 'email' | 'reference' | 'ambiguous';
  link_score: number;
  normalized_reference: string | null;
  normalized_donor: string | null;
  normalized_email: string | null;
}

export async function getSearchBootstrap(workspacePath: string): Promise<SearchBootstrap> {
  const { db } = await openSessionDatabase(workspacePath);

  try {
    const metadata = queryRows<{
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
    )[0];

    return {
      summary: metadata
        ? {
            peopleCount: Number(metadata.people_count),
            donationCount: Number(metadata.donation_count),
            linkedDonationCount: Number(metadata.linked_donation_count),
            warnings: JSON.parse(String(metadata.warnings_json)) as string[]
          }
        : null,
      peopleCount: getTableCount(db, 'people'),
      donationCount: getTableCount(db, 'donations'),
      roleNames: getDistinctValues(db, 'people', 'role_name'),
      groups: getDistinctValues(db, 'people', 'group_name'),
      counties: getDistinctValues(db, 'people', 'county'),
      regions: getDistinctValues(db, 'people', 'region'),
      campaigns: getDistinctValues(db, 'donations', 'campaign'),
      frequencies: getDistinctValues(db, 'donations', 'frequency'),
      statuses: getDistinctValues(db, 'donations', 'status')
    };
  } finally {
    db.close();
  }
}

export async function searchPeople(
  workspacePath: string,
  query: PeopleSearchQuery
): Promise<PersonSearchResult[]> {
  const { db } = await openSessionDatabase(workspacePath);

  try {
    const normalizedQuery = normalizeSearchText(query.text);
    const { whereClause, params } = buildPeopleWhereClause(query, normalizedQuery);
    const rows = queryRows<PersonDatabaseRow>(
      db,
      `
        SELECT
          people.id,
          people.person_number,
          people.first_name,
          people.surname,
          people.full_name,
          people.email,
          people.role_name,
          people.group_name,
          people.county,
          people.region,
          COUNT(donations.id) AS linked_donation_count
        FROM people
        LEFT JOIN donations ON donations.linked_person_id = people.id
        WHERE ${whereClause}
        GROUP BY people.id
        ORDER BY
          CASE
            WHEN ? <> '' AND people.full_name IS NOT NULL AND lower(people.full_name) = ? THEN 0
            WHEN ? <> '' AND people.full_name IS NOT NULL AND lower(people.full_name) LIKE ? ESCAPE '\\' THEN 1
            ELSE 2
          END,
          people.surname COLLATE NOCASE,
          people.first_name COLLATE NOCASE
        LIMIT ?
      `,
      [
        ...params,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        `${escapeLikeValue(normalizedQuery)}%`,
        query.limit ?? DEFAULT_LIMIT
      ]
    );

    if (rows.length > 0 || !normalizedQuery) {
      return rows.map(mapPersonRow);
    }

    return fuzzySearchPeople(db, query);
  } finally {
    db.close();
  }
}

export async function searchDonations(
  workspacePath: string,
  query: DonationSearchQuery
): Promise<DonationSearchResult[]> {
  const { db } = await openSessionDatabase(workspacePath);

  try {
    return searchDonationsInDatabase(db, query);
  } finally {
    db.close();
  }
}

export async function getLinkedDonations(
  workspacePath: string,
  personId: string
): Promise<DonationSearchResult[]> {
  const { db } = await openSessionDatabase(workspacePath);

  try {
    const rows = queryRows<DonationDatabaseRow>(
      db,
      `
        SELECT
          id,
          donor,
          reference,
          email,
          campaign,
          frequency,
          status,
          next_payment_date,
          linked_person_id,
          link_basis,
          link_score,
          normalized_reference,
          normalized_donor,
          normalized_email
        FROM donations
        WHERE linked_person_id = ?
        ORDER BY next_payment_date ASC, donor COLLATE NOCASE, reference COLLATE NOCASE
      `,
      [personId]
    );

    return rows.map(mapDonationRow);
  } finally {
    db.close();
  }
}

function searchDonationsInDatabase(db: Database, query: DonationSearchQuery): DonationSearchResult[] {
  const normalizedQuery = normalizeSearchText(query.text);
  const { whereClause, params } = buildDonationWhereClause(query, normalizedQuery);
  const rows = queryRows<DonationDatabaseRow>(
    db,
    `
      SELECT
        id,
        donor,
        reference,
        email,
        campaign,
        frequency,
        status,
        next_payment_date,
        linked_person_id,
        link_basis,
        link_score,
        normalized_reference,
        normalized_donor,
        normalized_email
      FROM donations
      WHERE ${whereClause}
      ORDER BY
        CASE
          WHEN ? <> '' AND lower(coalesce(reference, '')) = ? THEN 0
          WHEN ? <> '' AND lower(coalesce(reference, '')) LIKE ? ESCAPE '\\' THEN 1
          ELSE 2
        END,
        donor COLLATE NOCASE,
        reference COLLATE NOCASE
      LIMIT ?
    `,
    [
      ...params,
      normalizedQuery,
      normalizedQuery,
      normalizedQuery,
      `${escapeLikeValue(normalizedQuery)}%`,
      query.limit ?? DEFAULT_LIMIT
    ]
  );

  if (rows.length > 0 || !normalizedQuery) {
    return rows.map(mapDonationRow);
  }

  return fuzzySearchDonations(db, query);
}

function fuzzySearchPeople(db: Database, query: PeopleSearchQuery): PersonSearchResult[] {
  const { whereClause, params } = buildPeopleWhereClause({ ...query, text: '' }, '');
  const candidates = queryRows<PersonDatabaseRow>(
    db,
    `
      SELECT
        people.id,
        people.person_number,
        people.first_name,
        people.surname,
        people.full_name,
        people.email,
        people.role_name,
        people.group_name,
        people.county,
        people.region,
        COUNT(donations.id) AS linked_donation_count
      FROM people
      LEFT JOIN donations ON donations.linked_person_id = people.id
      WHERE ${whereClause}
      GROUP BY people.id
    `,
    params
  );

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreFuzzyMatch(query.text, [candidate.full_name, candidate.person_number].filter(Boolean).join(' '))
    }))
    .filter((entry) => entry.score >= 0.45)
    .sort((left, right) => right.score - left.score)
    .slice(0, query.limit ?? DEFAULT_LIMIT)
    .map((entry) => mapPersonRow(entry.candidate));
}

function fuzzySearchDonations(db: Database, query: DonationSearchQuery): DonationSearchResult[] {
  const { whereClause, params } = buildDonationWhereClause({ ...query, text: '' }, '');
  const candidates = queryRows<DonationDatabaseRow>(
    db,
    `
      SELECT
        id,
        donor,
        reference,
        email,
        campaign,
        frequency,
        status,
        next_payment_date,
        linked_person_id,
        link_basis,
        link_score,
        normalized_reference,
        normalized_donor,
        normalized_email
      FROM donations
      WHERE ${whereClause}
    `,
    params
  );

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreFuzzyMatch(
        query.text,
        [candidate.reference, candidate.donor, candidate.email].filter(Boolean).join(' ')
      )
    }))
    .filter((entry) => entry.score >= 0.45)
    .sort((left, right) => right.score - left.score)
    .slice(0, query.limit ?? DEFAULT_LIMIT)
    .map((entry) => mapDonationRow(entry.candidate));
}

function buildPeopleWhereClause(query: PeopleSearchQuery, normalizedQuery: string): {
  whereClause: string;
  params: Array<string>;
} {
  const conditions = ['1 = 1'];
  const params: string[] = [];

  if (query.filters.roleName) {
    conditions.push('role_name = ?');
    params.push(query.filters.roleName);
  }

  if (query.filters.group) {
    conditions.push('group_name = ?');
    params.push(query.filters.group);
  }

  if (query.filters.county) {
    conditions.push('county = ?');
    params.push(query.filters.county);
  }

  if (query.filters.region) {
    conditions.push('region = ?');
    params.push(query.filters.region);
  }

  for (const token of tokenizeSearchText(normalizedQuery)) {
    conditions.push(`(lower(coalesce(full_name, '')) LIKE ? ESCAPE '\\' OR person_number LIKE ? ESCAPE '\\')`);
    params.push(`%${escapeLikeValue(token)}%`, `%${escapeLikeValue(token)}%`);
  }

  return {
    whereClause: conditions.join(' AND '),
    params
  };
}

function buildDonationWhereClause(query: DonationSearchQuery, normalizedQuery: string): {
  whereClause: string;
  params: Array<string>;
} {
  const conditions = ['1 = 1'];
  const params: string[] = [];

  if (query.filters.campaign) {
    conditions.push('campaign = ?');
    params.push(query.filters.campaign);
  }

  if (query.filters.frequency) {
    conditions.push('frequency = ?');
    params.push(query.filters.frequency);
  }

  if (query.filters.status) {
    conditions.push('status = ?');
    params.push(query.filters.status);
  }

  if (query.filters.nextPaymentFrom) {
    conditions.push('next_payment_date >= ?');
    params.push(query.filters.nextPaymentFrom);
  }

  if (query.filters.nextPaymentTo) {
    conditions.push('next_payment_date <= ?');
    params.push(query.filters.nextPaymentTo);
  }

  for (const token of tokenizeSearchText(normalizedQuery)) {
    conditions.push(`(
      lower(coalesce(reference, '')) LIKE ? ESCAPE '\\'
      OR lower(coalesce(donor, '')) LIKE ? ESCAPE '\\'
      OR lower(coalesce(email, '')) LIKE ? ESCAPE '\\'
    )`);
    params.push(
      `%${escapeLikeValue(token)}%`,
      `%${escapeLikeValue(token)}%`,
      `%${escapeLikeValue(token)}%`
    );
  }

  return {
    whereClause: conditions.join(' AND '),
    params
  };
}

function getDistinctValues(db: Database, tableName: string, columnName: string): string[] {
  return queryRows<{ value: string }>(
    db,
    `
      SELECT DISTINCT ${columnName} AS value
      FROM ${tableName}
      WHERE ${columnName} IS NOT NULL AND ${columnName} <> ''
      ORDER BY ${columnName} COLLATE NOCASE
    `
  ).map((row) => row.value);
}

function getTableCount(db: Database, tableName: string): number {
  const row = queryRows<{ total: number }>(db, `SELECT COUNT(*) AS total FROM ${tableName}`)[0];
  return row ? Number(row.total) : 0;
}

function mapPersonRow(row: PersonDatabaseRow): PersonSearchResult {
  return {
    id: row.id,
    personNumber: row.person_number,
    firstName: row.first_name,
    surname: row.surname,
    fullName: row.full_name,
    email: row.email,
    roleName: row.role_name,
    group: row.group_name,
    county: row.county,
    region: row.region,
    linkedDonationCount: Number(row.linked_donation_count)
  };
}

function mapDonationRow(row: DonationDatabaseRow): DonationSearchResult {
  return {
    id: row.id,
    donor: row.donor,
    reference: row.reference,
    email: row.email,
    campaign: row.campaign,
    frequency: row.frequency,
    status: row.status,
    nextPaymentDate: row.next_payment_date,
    linkedPersonId: row.linked_person_id,
    linkBasis: row.link_basis,
    linkScore: Number(row.link_score)
  };
}

function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}