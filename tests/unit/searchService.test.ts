import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openSessionDatabase, persistSessionDatabase } from '../../src/main/services/database';
import {
  getLinkedDonations,
  getSearchBootstrap,
  searchDonations,
  searchPeople
} from '../../src/main/services/searchService';

const createdRoots: string[] = [];

async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'people-search-search-'));
  createdRoots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('searchService', () => {
  it('supports people and donation search plus linked donation lookups', async () => {
    const workspacePath = await createWorkspace();
    const { db, dbPath } = await openSessionDatabase(workspacePath);

    try {
      db.run(
        `
          INSERT INTO people (id, person_number, first_name, surname, full_name, normalized_full_name, email, normalized_email, role_name, group_name, county, region, raw_json)
          VALUES
            ('p1', '1001', 'John', 'Smith', 'John Smith', 'john smith', NULL, NULL, 'Lead', 'North', 'Dublin', 'East', '{}'),
            ('p2', '1002', 'Joanna', 'Smythe', 'Joanna Smythe', 'joanna smythe', NULL, NULL, 'Coordinator', 'South', 'Cork', 'South', '{}')
        `
      );
      db.run(
        `
          INSERT INTO donations (id, donor, reference, email, normalized_donor, normalized_reference, normalized_email, campaign, frequency, status, next_payment_date, raw_json, linked_person_id, link_basis, link_score)
          VALUES
            ('d1', 'Alice Example', 'John Smith', 'john@example.com', 'alice example', 'john smith', 'john@example.com', 'Spring', 'Monthly', 'Active', '2026-05-01', '{}', 'p1', 'reference', 0.85),
            ('d2', 'Mark Roe', 'Joanna Smythe', 'joanna@example.com', 'mark roe', 'joanna smythe', 'joanna@example.com', 'Summer', 'Quarterly', 'Paused', '2026-06-15', '{}', 'p2', 'reference', 0.85)
        `
      );
      db.run(
        `
          INSERT INTO import_metadata (
            id, workbook_name, people_sheet, people_header_row, donations_sheet, donations_header_row,
            people_count, donation_count, linked_donation_count, imported_at, mapping_json, warnings_json
          ) VALUES (1, 'fixture.xlsx', 'People', 2, 'Table1', 1, 2, 2, 2, '2026-01-01T00:00:00.000Z', '{}', '[]')
        `
      );
      await persistSessionDatabase(db, dbPath);
    } finally {
      db.close();
    }

    const bootstrap = await getSearchBootstrap(workspacePath);
    expect(bootstrap.peopleCount).toBe(2);
    expect(bootstrap.donationCount).toBe(2);
    expect(bootstrap.roleNames).toEqual(['Coordinator', 'Lead']);

    const peopleResults = await searchPeople(workspacePath, {
      text: 'jo sm',
      filters: { county: 'Dublin' }
    });
    expect(peopleResults).toHaveLength(1);
    expect(peopleResults[0].fullName).toBe('John Smith');

    const donationResults = await searchDonations(workspacePath, {
      text: 'joanna',
      filters: { status: 'Paused' }
    });
    expect(donationResults).toHaveLength(1);
    expect(donationResults[0].reference).toBe('Joanna Smythe');

    const linkedDonations = await getLinkedDonations(workspacePath, 'p1');
    expect(linkedDonations).toHaveLength(1);
    expect(linkedDonations[0].id).toBe('d1');
  });
});