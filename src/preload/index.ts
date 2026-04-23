import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSession,
  DatasetKey,
  DonationSearchQuery,
  DonationSearchResult,
  DesktopApi,
  ImportConfiguration,
  ImportExecutionResult,
  ImportSourceInspection,
  ImportSourceSelectionResult,
  OpenSessionResult,
  PeopleSearchQuery,
  PersonSearchResult,
  SaveSessionResult,
  SearchBootstrap,
  WorkbookInspection,
  WorkbookSelectionResult
} from '../shared/types';

const api: DesktopApi = {
  session: {
    getCurrent: () => ipcRenderer.invoke('session:get-current') as Promise<AppSession>,
    save: () => ipcRenderer.invoke('session:save') as Promise<SaveSessionResult>,
    openSaved: () => ipcRenderer.invoke('session:open-saved') as Promise<OpenSessionResult>,
    clear: () => ipcRenderer.invoke('session:clear') as Promise<AppSession>
  },
  imports: {
    selectWorkbook: () =>
      ipcRenderer.invoke('imports:select-workbook') as Promise<WorkbookSelectionResult>,
    inspectCurrentWorkbook: () =>
      ipcRenderer.invoke('imports:inspect-current-workbook') as Promise<WorkbookInspection>,
    selectImportSource: (dataset: DatasetKey) =>
      ipcRenderer.invoke('imports:select-import-source', dataset) as Promise<ImportSourceSelectionResult>,
    inspectImportSource: (dataset: DatasetKey) =>
      ipcRenderer.invoke('imports:inspect-import-source', dataset) as Promise<ImportSourceInspection>,
    runImport: (config: ImportConfiguration) =>
      ipcRenderer.invoke('imports:run-import', config) as Promise<ImportExecutionResult>
  },
  search: {
    getBootstrap: () => ipcRenderer.invoke('search:get-bootstrap') as Promise<SearchBootstrap>,
    searchPeople: (query: PeopleSearchQuery) =>
      ipcRenderer.invoke('search:people', query) as Promise<PersonSearchResult[]>,
    searchDonations: (query: DonationSearchQuery) =>
      ipcRenderer.invoke('search:donations', query) as Promise<DonationSearchResult[]>,
    getLinkedDonations: (personId: string) =>
      ipcRenderer.invoke('search:linked-donations', personId) as Promise<DonationSearchResult[]>
  }
};

contextBridge.exposeInMainWorld('peopleSearch', api);