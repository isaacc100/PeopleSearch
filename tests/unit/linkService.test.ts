import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openSessionDatabase, persistSessionDatabase, queryRows } from '../../src/main/services/database';
import { refreshDonationLinks } from '../../src/main/services/linkService';

const createdRoots: string[] = [];

async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'people-search-links-'));
  createdRoots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('refreshDonationLinks', () => {
  it('links donations by email first and by unique name second', async () => {
    const workspacePath = await createWorkspace();
    const { db, dbPath } = await openSessionDatabase(workspacePath);

    try {
      db.run(
        `
          INSERT INTO people (id, person_number, first_name, surname, full_name, normalized_full_name, email, normalized_email, role_name, group_name, county, region, raw_json)
          VALUES
            ('p1', '1001', 'John', 'Smith', 'John Smith', 'john smith', NULL, NULL, 'Lead', 'North', 'Dublin', 'East', '{}'),
            ('p2', '1002', 'Jane', 'Doe', 'Jane Doe', 'jane doe', 'jane@example.com', 'jane@example.com', 'Coordinator', 'South', 'Cork', 'South', '{}')
        `
      );
      db.run(
        `
          INSERT INTO donations (id, donor, reference, email, normalized_donor, normalized_reference, normalized_email, campaign, frequency, status, next_payment_date, raw_json, linked_person_id, link_basis, link_score)
          VALUES
            ('d1', 'Donor A', 'John Smith', NULL, 'donor a', 'john smith', NULL, NULL, NULL, NULL, NULL, '{}', NULL, 'none', 0),
            ('d2', 'Donor B', 'Jane Doe', 'jane@example.com', 'donor b', 'jane doe', 'jane@example.com', NULL, NULL, NULL, NULL, '{}', NULL, 'none', 0)
        `
      );
      db.run(
        `
          INSERT INTO import_metadata (
            id, workbook_name, people_sheet, people_header_row, donations_sheet, donations_header_row,
            people_count, donation_count, linked_donation_count, imported_at, mapping_json, warnings_json
          ) VALUES (1, 'fixture.xlsx', 'People', 2, 'Table1', 1, 2, 2, 0, '2026-01-01T00:00:00.000Z', '{}', '[]')
        `
      );
      await persistSessionDatabase(db, dbPath);
    } finally {
      db.close();
    }

    const linkedCount = await refreshDonationLinks(workspacePath);
    expect(linkedCount).toBe(2);

    const refreshed = await openSessionDatabase(workspacePath);

    try {
      const rows = queryRows<{ id: string; linked_person_id: string; link_basis: string }>(
        refreshed.db,
        'SELECT id, linked_person_id, link_basis FROM donations ORDER BY id'
      );

      expect(rows[0]).toEqual({ id: 'd1', linked_person_id: 'p1', link_basis: 'reference' });
      expect(rows[1]).toEqual({ id: 'd2', linked_person_id: 'p2', link_basis: 'email' });
    } finally {
      refreshed.db.close();
    }
  });
});