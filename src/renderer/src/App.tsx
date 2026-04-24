import { useEffect, useState } from 'react';
import {
  DATASET_LABELS,
  getSessionSourceFileName,
  type AppSession,
  type DatasetKey,
  type DonationSearchResult,
  type ImportSummary,
  type PersonSearchResult,
  type SearchBootstrap
} from '../../shared/types';
import CombinedView from './features/combined/CombinedView';
import DonationsView from './features/donations/DonationsView';
import ImportWizard from './features/import/ImportWizard';
import PeopleView from './features/people/PeopleView';

type ActionState = 'loading' | 'idle' | 'saving' | 'clearing';
type ActiveView = 'people' | 'donations' | 'combined';

const workstreams = [
  {
    title: 'Young People',
    description: 'Search by name, role, group, or location.'
  },
  {
    title: 'Youth Subs',
    description: 'Search by donor, reference, or email.'
  },
  {
    title: 'Combined',
    description: 'View linked Young People and Youth Subs records together.'
  }
];

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatSourceName(session: AppSession | null, dataset: DatasetKey): string {
  return getSessionSourceFileName(session, dataset) ?? 'No file loaded yet';
}

export default function App(): JSX.Element {
  const [session, setSession] = useState<AppSession | null>(null);
  const [actionState, setActionState] = useState<ActionState>('loading');
  const [message, setMessage] = useState('Creating a temporary workspace for this app session.');
  const [bootstrap, setBootstrap] = useState<SearchBootstrap | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('people');
  const [isSearchMaximized, setIsSearchMaximized] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonSearchResult | null>(null);
  const [linkedDonations, setLinkedDonations] = useState<DonationSearchResult[]>([]);

  useEffect(() => {
    if (session?.dataState === 'ready') {
      void loadSearchBootstrap();
      return;
    }

    setBootstrap(null);
    setIsSearchMaximized(false);
    setSelectedPerson(null);
    setLinkedDonations([]);
  }, [session?.id, session?.dataState]);

  useEffect(() => {
    if (!session || session.dataState !== 'ready' || !selectedPerson) {
      setLinkedDonations([]);
      return;
    }

    let isCancelled = false;

    void window.peopleSearch.search.getLinkedDonations(selectedPerson.id).then((results) => {
      if (!isCancelled) {
        setLinkedDonations(results);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedPerson, session?.dataState, session?.id]);

  useEffect(() => {
    void loadSession();
  }, []);

  async function loadSession(): Promise<void> {
    setActionState('loading');

    try {
      const currentSession = await window.peopleSearch.session.getCurrent();
      setSession(currentSession);
      setMessage(
        currentSession.mode === 'temporary'
          ? 'Temporary session is active. Data will be deleted on exit unless you save it.'
          : 'Saved workspace is active. This session will stay available after the app closes.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load the current session.');
    } finally {
      setActionState('idle');
    }
  }

  async function handleSaveWorkspace(): Promise<void> {
    setActionState('saving');

    try {
      const result = await window.peopleSearch.session.save();
      setSession(result.session);
      setMessage(
        result.canceled
          ? 'Save cancelled. The current session is still active.'
          : 'Workspace saved. You can reopen this folder in a later implementation step.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Saving the workspace failed.');
    } finally {
      setActionState('idle');
    }
  }

  async function handleClearWorkspace(): Promise<void> {
    setActionState('clearing');

    try {
      const freshSession = await window.peopleSearch.session.clear();
      setSession(freshSession);
      setMessage('Started a fresh temporary session. Previous unsaved data has been discarded.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Clearing the workspace failed.');
    } finally {
      setActionState('idle');
    }
  }

  async function handleChooseImportSource(dataset: DatasetKey): Promise<void> {
    setActionState('loading');

    try {
      const result = await window.peopleSearch.imports.selectImportSource(dataset);
      setSession(result.session);
      setMessage(
        result.canceled
          ? `${DATASET_LABELS[dataset]} source selection cancelled. The current session remains unchanged.`
          : `${DATASET_LABELS[dataset]} source ${formatSourceName(result.session, dataset)} copied into the local session workspace.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : `Selecting the ${DATASET_LABELS[dataset]} source failed.`
      );
    } finally {
      setActionState('idle');
    }
  }

  async function handleOpenSavedSession(): Promise<void> {
    setActionState('loading');

    try {
      const result = await window.peopleSearch.session.openSaved();
      setSession(result.session);
      setMessage(
        result.canceled
          ? 'Open saved workspace cancelled. The current session remains unchanged.'
          : 'Saved workspace loaded. You can continue from the imported data in that folder.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Opening a saved workspace failed.');
    } finally {
      setActionState('idle');
    }
  }

  async function loadSearchBootstrap(): Promise<void> {
    try {
      const nextBootstrap = await window.peopleSearch.search.getBootstrap();
      setBootstrap(nextBootstrap);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Loading the search workspace failed.');
    }
  }

  function handleImported(nextSession: AppSession, summary: ImportSummary): void {
    setSession(nextSession);
    setSelectedPerson(null);
    setMessage(
      `Imported ${summary.peopleCount} people and ${summary.donationCount} donation rows into the local database.`
    );
  }

  function handleSelectPerson(person: PersonSearchResult): void {
    setSelectedPerson(person);
    setActiveView('combined');
  }

  const isSearchReady = session?.dataState === 'ready' && Boolean(bootstrap);

  return (
    <main className={`app-shell ${isSearchMaximized ? 'search-maximized' : ''}`}>
      <section className="hero-panel app-section">
        <div className="hero-copy">
          <h1>PeopleSearch</h1>
          <p className="hero-text">
            Search Young People and Youth Subs data from your spreadsheets.
          </p>
        </div>

        <aside className="session-card">
          <div className="status-row">
            <span className={`session-pill ${session?.mode ?? 'temporary'}`}>
              {session?.mode === 'saved' ? 'Saved session' : 'Temporary session'}
            </span>
            <span className="subtle-label">
              {actionState === 'loading'
                ? 'Loading'
                : actionState === 'saving'
                  ? 'Saving'
                  : actionState === 'clearing'
                    ? 'Clearing'
                    : 'Ready'}
            </span>
          </div>

          <div className="session-grid">
            <div>
              <span className="field-label">Workspace</span>
              <p className="field-value path">{session?.workspacePath ?? 'Preparing workspace...'}</p>
            </div>
            <div>
              <span className="field-label">Created</span>
              <p className="field-value">
                {session ? formatTimestamp(session.createdAt) : 'Preparing workspace...'}
              </p>
            </div>
            <div>
              <span className="field-label">Young People File</span>
              <p className="field-value">{formatSourceName(session, 'people')}</p>
            </div>
            <div>
              <span className="field-label">Youth Subs File</span>
              <p className="field-value">{formatSourceName(session, 'donations')}</p>
            </div>
            <div>
              <span className="field-label">Status</span>
              <p className="field-value">{message}</p>
            </div>
          </div>

          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              disabled={actionState !== 'idle' || !session}
              onClick={() => {
                void handleChooseImportSource('people');
              }}
            >
              Select Young People File
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={actionState !== 'idle' || !session}
              onClick={() => {
                void handleChooseImportSource('donations');
              }}
            >
              Select Youth Subs File
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={actionState !== 'idle'}
              onClick={() => {
                void handleOpenSavedSession();
              }}
            >
              Open Saved
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={actionState !== 'idle' || !session}
              onClick={() => {
                void handleSaveWorkspace();
              }}
            >
              Save Workspace
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={actionState !== 'idle' || !session}
              onClick={() => {
                void handleClearWorkspace();
              }}
            >
              Clear Data
            </button>
          </div>
        </aside>
      </section>

      <div className="app-section">
        <ImportWizard
          session={session}
          onChooseImportSource={handleChooseImportSource}
          onImported={handleImported}
          onStatusChange={setMessage}
        />
      </div>

      {isSearchReady && bootstrap ? (
        <section className="roadmap-panel search-workspace-panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Phase 4</p>
              <h2>Search Workspace</h2>
            </div>
            <div className="search-header-actions">
              <div className="segmented-control">
                {(['people', 'donations', 'combined'] as ActiveView[]).map((view) => (
                  <button
                    className={`segment-button ${activeView === view ? 'active' : ''}`}
                    key={view}
                    type="button"
                    onClick={() => {
                      setActiveView(view);
                    }}
                  >
                    {view === 'people' ? 'Young People' : view === 'donations' ? 'Youth Subs' : 'Combined'}
                  </button>
                ))}
              </div>
              <button
                aria-pressed={isSearchMaximized}
                className="secondary-button"
                type="button"
                onClick={() => {
                  setIsSearchMaximized((currentValue) => !currentValue);
                }}
              >
                {isSearchMaximized ? 'Restore Layout' : 'Maximise Search'}
              </button>
            </div>
          </div>

          <div className="search-summary-grid">
            <article className="workstream-card">
              <h3>Young People indexed</h3>
              <p>{bootstrap.peopleCount}</p>
            </article>
            <article className="workstream-card">
              <h3>Youth Subs indexed</h3>
              <p>{bootstrap.donationCount}</p>
            </article>
            <article className="workstream-card">
              <h3>Linked Youth Subs</h3>
              <p>{bootstrap.summary?.linkedDonationCount ?? 0}</p>
            </article>
          </div>

          {activeView === 'people' ? (
            <PeopleView
              bootstrap={bootstrap}
              selectedPersonId={selectedPerson?.id ?? null}
              onSelectPerson={handleSelectPerson}
            />
          ) : null}

          {activeView === 'donations' ? <DonationsView bootstrap={bootstrap} /> : null}

          {activeView === 'combined' ? (
            <CombinedView
              bootstrap={bootstrap}
              selectedPerson={selectedPerson}
              linkedDonations={linkedDonations}
              onSelectPerson={handleSelectPerson}
            />
          ) : null}
        </section>
      ) : (
        <section className="roadmap-panel">
          <div className="panel-header">
            <p className="eyebrow">Search &amp; Views</p>
            <h2>Import, search, and linked views</h2>
          </div>
          <div className="workstream-grid">
            {workstreams.map((item) => (
              <article className="workstream-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}