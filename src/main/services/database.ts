import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import initSqlJs, { type BindParams, type Database, type SqlJsStatic } from 'sql.js';

const require = createRequire(import.meta.url);
const DATABASE_FILE_NAME = 'people-search.sqlite';

let sqlModulePromise: Promise<SqlJsStatic> | null = null;

export interface SessionDatabase {
  db: Database;
  dbPath: string;
}

export function getDatabasePath(workspacePath: string): string {
  return join(workspacePath, 'data', DATABASE_FILE_NAME);
}

export async function openSessionDatabase(workspacePath: string): Promise<SessionDatabase> {
  const dbPath = getDatabasePath(workspacePath);
  await mkdir(join(workspacePath, 'data'), { recursive: true });
  const SQL = await getSqlModule();

  const db = existsSync(dbPath)
    ? new SQL.Database(new Uint8Array(await readFile(dbPath)))
    : new SQL.Database();

  initializeSchema(db);
  return { db, dbPath };
}

export async function persistSessionDatabase(db: Database, dbPath: string): Promise<void> {
  await writeFile(dbPath, Buffer.from(db.export()));
}

export function queryRows<T extends Record<string, unknown>>(
  db: Database,
  sql: string,
  params: BindParams = []
): T[] {
  const statement = db.prepare(sql, params);
  const rows: T[] = [];

  try {
    while (statement.step()) {
      rows.push(statement.getAsObject() as T);
    }
  } finally {
    statement.free();
  }

  return rows;
}

export function initializeSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      person_number TEXT,
      first_name TEXT,
      surname TEXT,
      full_name TEXT,
      normalized_full_name TEXT,
      email TEXT,
      normalized_email TEXT,
      role_name TEXT,
      group_name TEXT,
      county TEXT,
      region TEXT,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY,
      donor TEXT,
      reference TEXT,
      email TEXT,
      normalized_donor TEXT,
      normalized_reference TEXT,
      normalized_email TEXT,
      campaign TEXT,
      frequency TEXT,
      status TEXT,
      next_payment_date TEXT,
      raw_json TEXT NOT NULL,
      linked_person_id TEXT,
      link_basis TEXT NOT NULL DEFAULT 'none',
      link_score REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS import_metadata (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      workbook_name TEXT NOT NULL,
      people_sheet TEXT NOT NULL,
      people_header_row INTEGER NOT NULL,
      donations_sheet TEXT NOT NULL,
      donations_header_row INTEGER NOT NULL,
      people_count INTEGER NOT NULL,
      donation_count INTEGER NOT NULL,
      linked_donation_count INTEGER NOT NULL,
      imported_at TEXT NOT NULL,
      mapping_json TEXT NOT NULL,
      warnings_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_people_full_name ON people(normalized_full_name);
    CREATE INDEX IF NOT EXISTS idx_people_role ON people(role_name);
    CREATE INDEX IF NOT EXISTS idx_people_group ON people(group_name);
    CREATE INDEX IF NOT EXISTS idx_people_county ON people(county);
    CREATE INDEX IF NOT EXISTS idx_people_region ON people(region);
    CREATE INDEX IF NOT EXISTS idx_people_email ON people(normalized_email);

    CREATE INDEX IF NOT EXISTS idx_donations_reference ON donations(normalized_reference);
    CREATE INDEX IF NOT EXISTS idx_donations_donor ON donations(normalized_donor);
    CREATE INDEX IF NOT EXISTS idx_donations_email ON donations(normalized_email);
    CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign);
    CREATE INDEX IF NOT EXISTS idx_donations_frequency ON donations(frequency);
    CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
    CREATE INDEX IF NOT EXISTS idx_donations_next_payment_date ON donations(next_payment_date);
  `);
}

async function getSqlModule(): Promise<SqlJsStatic> {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs({
      locateFile: (fileName) => require.resolve(`sql.js/dist/${fileName}`)
    });
  }

  return sqlModulePromise;
}