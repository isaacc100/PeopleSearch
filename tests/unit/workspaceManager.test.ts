import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceManager } from '../../src/main/services/workspaceManager';

const createdRoots: string[] = [];

async function createRoot(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  createdRoots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    createdRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('WorkspaceManager', () => {
  it('creates a temporary session and writes metadata', async () => {
    const tempRoot = await createRoot('people-search-temp-');
    const manager = new WorkspaceManager({ appName: 'People Search', tempRoot });

    const session = await manager.getCurrentSession();
    const metadata = await readFile(join(session.workspacePath, 'session.json'), 'utf8');

    expect(session.mode).toBe('temporary');
    expect(existsSync(join(session.workspacePath, 'data'))).toBe(true);
    expect(existsSync(join(session.workspacePath, 'imports'))).toBe(true);
    expect(metadata).toContain('"mode": "temporary"');
  });

  it('saves a session into a chosen directory and updates its mode', async () => {
    const tempRoot = await createRoot('people-search-temp-');
    const saveRoot = await createRoot('people-search-save-');
    const manager = new WorkspaceManager({ appName: 'People Search', tempRoot });

    const originalSession = await manager.getCurrentSession();
    await writeFile(join(originalSession.workspacePath, 'imports', 'marker.txt'), 'ready', 'utf8');

    const savedSession = await manager.saveCurrentSession(saveRoot);

    expect(savedSession.mode).toBe('saved');
    expect(savedSession.workspacePath).toContain(saveRoot);
    expect(existsSync(join(savedSession.workspacePath, 'imports', 'marker.txt'))).toBe(true);
    expect(existsSync(originalSession.workspacePath)).toBe(false);
  });

  it('copies a selected workbook into the session workspace and records it', async () => {
    const tempRoot = await createRoot('people-search-temp-');
    const manager = new WorkspaceManager({ appName: 'People Search', tempRoot });
    const workbookFixtureRoot = await createRoot('people-search-fixture-');
    const workbookPath = join(workbookFixtureRoot, 'people-search.xlsx');

    await writeFile(workbookPath, 'fixture', 'utf8');

    const updatedSession = await manager.attachWorkbook(workbookPath);

    expect(updatedSession.workbookName).toBe('people-search.xlsx');
    expect(updatedSession.sourceFiles).toEqual({
      people: 'people-search.xlsx',
      donations: 'people-search.xlsx'
    });
    expect(updatedSession.dataState).toBe('staged');
    expect(existsSync(join(updatedSession.workspacePath, 'imports', 'people', 'people-search.xlsx'))).toBe(true);
    expect(existsSync(join(updatedSession.workspacePath, 'imports', 'donations', 'people-search.xlsx'))).toBe(true);
  });

  it('starts a fresh temporary session without deleting a saved workspace', async () => {
    const tempRoot = await createRoot('people-search-temp-');
    const saveRoot = await createRoot('people-search-save-');
    const manager = new WorkspaceManager({ appName: 'People Search', tempRoot });

    const firstSession = await manager.getCurrentSession();
    const savedSession = await manager.saveCurrentSession(saveRoot);
    const freshSession = await manager.startFreshSession();

    expect(firstSession.id).not.toBe(freshSession.id);
    expect(freshSession.mode).toBe('temporary');
    expect(existsSync(savedSession.workspacePath)).toBe(true);
  });

  it('cleans up an unsaved session on exit', async () => {
    const tempRoot = await createRoot('people-search-temp-');
    const manager = new WorkspaceManager({ appName: 'People Search', tempRoot });

    const session = await manager.getCurrentSession();

    await manager.cleanupOnExit();

    expect(existsSync(session.workspacePath)).toBe(false);
  });
});