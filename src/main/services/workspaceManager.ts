import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  DATASET_KEYS,
  DATASET_LABELS,
  getSessionSourceFileName,
  type AppSession,
  type DatasetKey,
  type DatasetSourceFiles
} from '../../shared/types';

const SESSION_FILE_NAME = 'session.json';

interface WorkspaceManagerOptions {
  appName: string;
  tempRoot: string;
}

export class WorkspaceManager {
  private currentSession: AppSession | null = null;

  constructor(private readonly options: WorkspaceManagerOptions) {}

  async getCurrentSession(): Promise<AppSession> {
    const session = await this.getOrCreateCurrentSession();
    return this.cloneSession(session);
  }

  async startFreshSession(): Promise<AppSession> {
    const existingSession = this.currentSession;

    if (existingSession?.mode === 'temporary') {
      await this.deleteDirectory(existingSession.workspacePath);
    }

    this.currentSession = await this.createTemporarySession();
    return this.cloneSession(this.currentSession);
  }

  async saveCurrentSession(destinationRoot: string): Promise<AppSession> {
    const currentSession = await this.getOrCreateCurrentSession();
    const targetDirectory = resolve(destinationRoot, `people-search-session-${currentSession.id}`);

    await mkdir(targetDirectory, { recursive: true });
    await cp(currentSession.workspacePath, targetDirectory, { recursive: true, force: true });

    const savedSession: AppSession = {
      ...currentSession,
      mode: 'saved',
      workspacePath: targetDirectory,
      updatedAt: new Date().toISOString()
    };

    await this.writeSessionMetadata(savedSession);

    if (currentSession.mode === 'temporary' && currentSession.workspacePath !== targetDirectory) {
      await this.deleteDirectory(currentSession.workspacePath);
    }

    this.currentSession = savedSession;
    return this.cloneSession(savedSession);
  }

  async openSavedSession(sessionDirectory: string): Promise<AppSession> {
    const metadataPath = join(sessionDirectory, SESSION_FILE_NAME);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as AppSession;

    this.currentSession = this.normalizeSession({
      ...metadata,
      mode: 'saved',
      workspacePath: sessionDirectory,
      updatedAt: new Date().toISOString()
    });
    await this.writeSessionMetadata(this.currentSession);

    return this.cloneSession(this.currentSession);
  }

  async attachImportSource(dataset: DatasetKey, sourceFilePath: string): Promise<AppSession> {
    return this.attachImportSources({
      [dataset]: sourceFilePath
    });
  }

  async attachWorkbook(sourceFilePath: string): Promise<AppSession> {
    return this.attachImportSources({
      people: sourceFilePath,
      donations: sourceFilePath
    });
  }

  async resolveCurrentImportSourcePath(dataset: DatasetKey): Promise<string> {
    const currentSession = await this.getOrCreateCurrentSession();
    const sourceName = getSessionSourceFileName(currentSession, dataset);

    if (!sourceName) {
      throw new Error(`No ${DATASET_LABELS[dataset]} source file has been selected for the current session.`);
    }

    const datasetSourcePath = join(currentSession.workspacePath, 'imports', dataset, sourceName);

    if (await this.pathExists(datasetSourcePath)) {
      return datasetSourcePath;
    }

    const legacySourcePath = join(currentSession.workspacePath, 'imports', sourceName);

    if (await this.pathExists(legacySourcePath)) {
      return legacySourcePath;
    }

    throw new Error(`The ${DATASET_LABELS[dataset]} source file could not be found in the current session workspace.`);
  }

  async resolveCurrentWorkbookPath(): Promise<string> {
    return this.resolveCurrentImportSourcePath('people');
  }

  async updateCurrentSession(patch: Partial<AppSession>): Promise<AppSession> {
    const currentSession = await this.getOrCreateCurrentSession();
    const updatedSession: AppSession = {
      ...currentSession,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    await this.writeSessionMetadata(updatedSession);
    this.currentSession = updatedSession;

    return this.cloneSession(updatedSession);
  }

  async cleanupOnExit(): Promise<void> {
    if (this.currentSession?.mode === 'temporary') {
      const workspacePath = this.currentSession.workspacePath;
      this.currentSession = null;
      await this.deleteDirectory(workspacePath);
    }
  }

  private async getOrCreateCurrentSession(): Promise<AppSession> {
    if (!this.currentSession) {
      this.currentSession = await this.createTemporarySession();
    }

    return this.normalizeSession(this.currentSession);
  }

  private async createTemporarySession(): Promise<AppSession> {
    const sessionId = randomUUID();
    const workspacePath = resolve(
      this.options.tempRoot,
      this.toSlug(this.options.appName),
      `session-${sessionId}`
    );
    const timestamp = new Date().toISOString();

    await mkdir(join(workspacePath, 'data'), { recursive: true });
    await mkdir(join(workspacePath, 'imports'), { recursive: true });

    const session: AppSession = {
      id: sessionId,
      mode: 'temporary',
      workspacePath,
      createdAt: timestamp,
      updatedAt: timestamp,
      sourceFiles: {},
      dataState: 'empty'
    };

    await this.writeSessionMetadata(session);
    return session;
  }

  private async writeSessionMetadata(session: AppSession): Promise<void> {
    const normalizedSession = this.normalizeSession(session);
    const sessionFilePath = join(session.workspacePath, SESSION_FILE_NAME);
    await writeFile(sessionFilePath, `${JSON.stringify(normalizedSession, null, 2)}\n`, 'utf8');
  }

  private async resetSessionData(workspacePath: string): Promise<void> {
    await rm(join(workspacePath, 'data'), { recursive: true, force: true });
    await mkdir(join(workspacePath, 'data'), { recursive: true });
  }

  private async deleteDirectory(directoryPath: string): Promise<void> {
    await rm(directoryPath, { recursive: true, force: true });
  }

  private async attachImportSources(sourceFilePaths: Partial<Record<DatasetKey, string>>): Promise<AppSession> {
    const currentSession = await this.getOrCreateCurrentSession();
    const nextSourceFiles: DatasetSourceFiles = {
      ...this.getLegacySourceFiles(currentSession),
      ...(currentSession.sourceFiles ?? {})
    };

    await this.resetSessionData(currentSession.workspacePath);

    for (const dataset of DATASET_KEYS) {
      const sourceFilePath = sourceFilePaths[dataset];

      if (!sourceFilePath) {
        continue;
      }

      const sourceFileName = basename(sourceFilePath);
      const targetDirectory = join(currentSession.workspacePath, 'imports', dataset);
      const targetSourcePath = join(targetDirectory, sourceFileName);

      await rm(targetDirectory, { recursive: true, force: true });
      await mkdir(targetDirectory, { recursive: true });
      await cp(sourceFilePath, targetSourcePath, { force: true });
      nextSourceFiles[dataset] = sourceFileName;
    }

    const updatedSession = this.normalizeSession({
      ...currentSession,
      sourceFiles: nextSourceFiles,
      workbookName: this.toLegacyWorkbookName(nextSourceFiles),
      dataState: Object.keys(nextSourceFiles).length > 0 ? 'staged' : 'empty',
      databasePath: undefined,
      importedAt: undefined,
      summary: undefined,
      updatedAt: new Date().toISOString()
    });

    await this.writeSessionMetadata(updatedSession);

    this.currentSession = updatedSession;
    return this.cloneSession(updatedSession);
  }

  private toSlug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  private cloneSession(session: AppSession): AppSession {
    return JSON.parse(JSON.stringify(this.normalizeSession(session))) as AppSession;
  }

  private normalizeSession(session: AppSession): AppSession {
    const mergedSourceFiles: DatasetSourceFiles = {
      ...this.getLegacySourceFiles(session),
      ...(session.sourceFiles ?? {})
    };
    const normalizedEntries = Object.entries(mergedSourceFiles).filter((entry) => Boolean(entry[1]));
    const normalizedSourceFiles = Object.fromEntries(normalizedEntries) as DatasetSourceFiles;
    const hasSourceFiles = normalizedEntries.length > 0;

    return {
      ...session,
      sourceFiles: hasSourceFiles ? normalizedSourceFiles : undefined,
      workbookName: this.toLegacyWorkbookName(normalizedSourceFiles)
    };
  }

  private getLegacySourceFiles(session: AppSession): DatasetSourceFiles {
    if (!session.workbookName) {
      return {};
    }

    return {
      people: session.workbookName,
      donations: session.workbookName
    };
  }

  private toLegacyWorkbookName(sourceFiles: DatasetSourceFiles): string | undefined {
    if (!sourceFiles.people || !sourceFiles.donations) {
      return undefined;
    }

    return sourceFiles.people === sourceFiles.donations ? sourceFiles.people : undefined;
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}