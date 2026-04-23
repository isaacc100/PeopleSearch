import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DatasetKey,
  DonationSearchQuery,
  ImportConfiguration,
  ImportExecutionResult,
  ImportSourceInspection,
  ImportSourceSelectionResult,
  OpenSessionResult,
  PeopleSearchQuery,
  PersonSearchResult,
  SaveSessionResult,
  SearchBootstrap,
  DonationSearchResult,
  WorkbookInspection,
  WorkbookSelectionResult
} from '../shared/types';
import { importSourceFilesIntoDatabase, resolveDatabasePath } from './services/importWorkbook';
import {
  getLinkedDonations,
  getSearchBootstrap,
  searchDonations,
  searchPeople
} from './services/searchService';
import { inspectImportSource, inspectWorkbook } from './services/workbookInspector';
import { WorkspaceManager } from './services/workspaceManager';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const IMPORT_FILE_EXTENSIONS = ['xlsx', 'xls', 'xlsm', 'xlsb', 'csv', 'tsv', 'txt', 'ods'];

let mainWindow: BrowserWindow | null = null;
let workspaceManager: WorkspaceManager | null = null;
let isQuitting = false;

function getWorkspaceManager(): WorkspaceManager {
  if (!workspaceManager) {
    workspaceManager = new WorkspaceManager({
      appName: 'People Search',
      tempRoot: app.getPath('temp')
    });
  }

  return workspaceManager;
}

async function createMainWindow(): Promise<BrowserWindow> {
  await getWorkspaceManager().getCurrentSession();

  const browserWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    title: 'People Search',
    backgroundColor: '#f6f1e8',
    webPreferences: {
      preload: join(currentDirectory, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  });

  browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    await browserWindow.loadURL(rendererUrl);
  } else {
    await browserWindow.loadFile(join(currentDirectory, '../renderer/index.html'));
  }

  browserWindow.on('closed', () => {
    mainWindow = null;
  });

  return browserWindow;
}

function registerIpcHandlers(): void {
  ipcMain.handle('session:get-current', async () => getWorkspaceManager().getCurrentSession());

  ipcMain.handle('session:save', async (): Promise<SaveSessionResult> => {
    if (!mainWindow) {
      throw new Error('The main window is not available.');
    }

    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a folder for the saved workspace',
      properties: ['openDirectory', 'createDirectory']
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return {
        canceled: true,
        session: await getWorkspaceManager().getCurrentSession()
      };
    }

    return {
      canceled: false,
      session: await getWorkspaceManager().saveCurrentSession(selection.filePaths[0])
    };
  });

  ipcMain.handle('session:open-saved', async (): Promise<OpenSessionResult> => {
    if (!mainWindow) {
      throw new Error('The main window is not available.');
    }

    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a saved People Search workspace',
      properties: ['openDirectory']
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return {
        canceled: true,
        session: await getWorkspaceManager().getCurrentSession()
      };
    }

    return {
      canceled: false,
      session: await getWorkspaceManager().openSavedSession(selection.filePaths[0])
    };
  });

  ipcMain.handle('session:clear', async () => getWorkspaceManager().startFreshSession());

  ipcMain.handle('imports:select-workbook', async (): Promise<WorkbookSelectionResult> => {
    if (!mainWindow) {
      throw new Error('The main window is not available.');
    }

    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a source file for People and Donations',
      properties: ['openFile'],
      filters: [
        {
          name: 'Spreadsheet or text data',
          extensions: IMPORT_FILE_EXTENSIONS
        }
      ]
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return {
        canceled: true,
        session: await getWorkspaceManager().getCurrentSession()
      };
    }

    return {
      canceled: false,
      session: await getWorkspaceManager().attachWorkbook(selection.filePaths[0])
    };
  });

  ipcMain.handle(
    'imports:select-import-source',
    async (_event, dataset: DatasetKey): Promise<ImportSourceSelectionResult> => {
      if (!mainWindow) {
        throw new Error('The main window is not available.');
      }

      const selection = await dialog.showOpenDialog(mainWindow, {
        title: `Choose a source file for ${dataset === 'people' ? 'People' : 'Donations'}`,
        properties: ['openFile'],
        filters: [
          {
            name: 'Spreadsheet or text data',
            extensions: IMPORT_FILE_EXTENSIONS
          }
        ]
      });

      if (selection.canceled || selection.filePaths.length === 0) {
        return {
          canceled: true,
          dataset,
          session: await getWorkspaceManager().getCurrentSession()
        };
      }

      return {
        canceled: false,
        dataset,
        session: await getWorkspaceManager().attachImportSource(dataset, selection.filePaths[0])
      };
    }
  );

  ipcMain.handle('imports:inspect-current-workbook', async (): Promise<WorkbookInspection> => {
    const workbookPath = await getWorkspaceManager().resolveCurrentWorkbookPath();
    return inspectWorkbook(workbookPath);
  });

  ipcMain.handle(
    'imports:inspect-import-source',
    async (_event, dataset: DatasetKey): Promise<ImportSourceInspection> => {
      const sourcePath = await getWorkspaceManager().resolveCurrentImportSourcePath(dataset);
      return inspectImportSource(sourcePath, dataset);
    }
  );

  ipcMain.handle(
    'imports:run-import',
    async (_event, config: ImportConfiguration): Promise<ImportExecutionResult> => {
      const manager = getWorkspaceManager();
      const session = await manager.getCurrentSession();
      const summary = await importSourceFilesIntoDatabase(
        session.workspacePath,
        {
          people: await manager.resolveCurrentImportSourcePath('people'),
          donations: await manager.resolveCurrentImportSourcePath('donations')
        },
        config
      );
      const importedAt = new Date().toISOString();
      const updatedSession = await manager.updateCurrentSession({
        dataState: 'ready',
        importedAt,
        databasePath: resolveDatabasePath(session.workspacePath),
        summary
      });

      return {
        session: updatedSession,
        summary
      };
    }
  );

  ipcMain.handle('search:get-bootstrap', async (): Promise<SearchBootstrap> => {
    const session = await getWorkspaceManager().getCurrentSession();
    return getSearchBootstrap(session.workspacePath);
  });

  ipcMain.handle('search:people', async (_event, query: PeopleSearchQuery): Promise<PersonSearchResult[]> => {
    const session = await getWorkspaceManager().getCurrentSession();
    return searchPeople(session.workspacePath, query);
  });

  ipcMain.handle(
    'search:donations',
    async (_event, query: DonationSearchQuery): Promise<DonationSearchResult[]> => {
      const session = await getWorkspaceManager().getCurrentSession();
      return searchDonations(session.workspacePath, query);
    }
  );

  ipcMain.handle('search:linked-donations', async (_event, personId: string): Promise<DonationSearchResult[]> => {
    const session = await getWorkspaceManager().getCurrentSession();
    return getLinkedDonations(session.workspacePath, personId);
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  mainWindow = await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow().then((window) => {
        mainWindow = window;
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isQuitting) {
    return;
  }

  event.preventDefault();

  void getWorkspaceManager()
    .cleanupOnExit()
    .finally(() => {
      isQuitting = true;
      app.quit();
    });
});