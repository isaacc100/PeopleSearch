import type { Database } from 'sql.js';
import { openSessionDatabase, persistSessionDatabase, queryRows } from './database';

interface PersonLinkRow {
  id: string;
  normalized_full_name: string | null;
  normalized_email: string | null;
}

interface DonationLinkRow {
  id: string;
  normalized_reference: string | null;
  normalized_email: string | null;
}

export function linkDatabaseRecords(db: Database): number {
  const peopleRows = queryRows<PersonLinkRow>(
    db,
    `
      SELECT id, normalized_full_name, normalized_email
      FROM people
    `
  );
  const donationRows = queryRows<DonationLinkRow>(
    db,
    `
      SELECT id, normalized_reference, normalized_email
      FROM donations
    `
  );

  const emailMap = buildUniqueMap(peopleRows, 'normalized_email');
  const nameMap = buildUniqueMap(peopleRows, 'normalized_full_name');
  const updateStatement = db.prepare(
    `
      UPDATE donations
      SET linked_person_id = ?, link_basis = ?, link_score = ?
      WHERE id = ?
    `
  );

  let linkedDonationCount = 0;

  try {
    for (const donationRow of donationRows) {
      let linkedPersonId: string | null = null;
      let linkBasis: 'none' | 'email' | 'reference' | 'ambiguous' = 'none';
      let linkScore = 0;

      if (donationRow.normalized_email) {
        const emailMatch = emailMap.get(donationRow.normalized_email);

        if (emailMatch === '__AMBIGUOUS__') {
          linkBasis = 'ambiguous';
        } else if (emailMatch) {
          linkedPersonId = emailMatch;
          linkBasis = 'email';
          linkScore = 1;
        }
      }

      if (!linkedPersonId && donationRow.normalized_reference) {
        const referenceMatch = nameMap.get(donationRow.normalized_reference);

        if (referenceMatch === '__AMBIGUOUS__') {
          linkBasis = 'ambiguous';
        } else if (referenceMatch) {
          linkedPersonId = referenceMatch;
          linkBasis = 'reference';
          linkScore = 0.85;
        }
      }

      if (linkedPersonId) {
        linkedDonationCount += 1;
      }

      updateStatement.run([linkedPersonId, linkBasis, linkScore, donationRow.id]);
    }
  } finally {
    updateStatement.free();
  }

  db.run('UPDATE import_metadata SET linked_donation_count = ? WHERE id = 1', [linkedDonationCount]);
  return linkedDonationCount;
}

export async function refreshDonationLinks(workspacePath: string): Promise<number> {
  const { db, dbPath } = await openSessionDatabase(workspacePath);

  try {
    db.run('BEGIN TRANSACTION');
    const linkedDonationCount = linkDatabaseRecords(db);
    db.run('COMMIT');
    await persistSessionDatabase(db, dbPath);
    return linkedDonationCount;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

function buildUniqueMap<Row extends { id: string }>(
  rows: Row[],
  key: keyof Row
): Map<string, string | '__AMBIGUOUS__'> {
  const values = new Map<string, string | '__AMBIGUOUS__'>();

  for (const row of rows) {
    const rawValue = row[key];

    if (typeof rawValue !== 'string' || !rawValue) {
      continue;
    }

    const existingValue = values.get(rawValue);

    if (!existingValue) {
      values.set(rawValue, row.id);
    } else if (existingValue !== row.id) {
      values.set(rawValue, '__AMBIGUOUS__');
    }
  }

  return values;
}