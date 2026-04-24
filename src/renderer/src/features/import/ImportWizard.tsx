import { useEffect, useState } from 'react';
import {
  createEmptyDonationFieldMap,
  createEmptyPeopleFieldMap,
  DATASET_LABELS,
  DONATION_FIELDS,
  DONATION_REQUIRED_FIELDS,
  FIELD_LABELS,
  getSessionSourceFileName,
  type AppSession,
  type DatasetKey,
  type DatasetSourceInspection,
  type DonationFieldKey,
  type DonationImportSourceInspection,
  type ImportConfiguration,
  type ImportSummary,
  type PeopleFieldKey,
  type PeopleImportSourceInspection,
  PEOPLE_FIELDS,
  PEOPLE_REQUIRED_FIELDS,
  suggestDonationFieldMap,
  suggestPeopleFieldMap,
  type SheetInspection
} from '../../../../shared/types';

interface ImportWizardProps {
  session: AppSession | null;
  onChooseImportSource: (dataset: DatasetKey) => Promise<void>;
  onImported: (nextSession: AppSession, summary: ImportSummary) => void;
  onStatusChange: (message: string) => void;
}

export default function ImportWizard({
  session,
  onChooseImportSource,
  onImported,
  onStatusChange
}: ImportWizardProps): JSX.Element {
  const [peopleInspection, setPeopleInspection] = useState<PeopleImportSourceInspection | null>(null);
  const [donationInspection, setDonationInspection] = useState<DonationImportSourceInspection | null>(null);
  const [peopleConfig, setPeopleConfig] = useState<ImportConfiguration['people'] | null>(null);
  const [donationConfig, setDonationConfig] = useState<ImportConfiguration['donations'] | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const peopleSourceName = getSessionSourceFileName(session, 'people');
  const donationSourceName = getSessionSourceFileName(session, 'donations');

  useEffect(() => {
    if (!peopleSourceName && !donationSourceName) {
      setPeopleInspection(null);
      setDonationInspection(null);
      setPeopleConfig(null);
      setDonationConfig(null);
      return;
    }

    let isCancelled = false;

    setIsInspecting(true);

    void Promise.all([inspectPeopleSource(), inspectDonationSource()])
      .then(([nextPeopleInspection, nextDonationInspection]) => {
        if (isCancelled) {
          return;
        }

        setPeopleInspection(nextPeopleInspection);
        setDonationInspection(nextDonationInspection);
        setPeopleConfig(
          nextPeopleInspection
            ? createDatasetImportConfig(nextPeopleInspection, createEmptyPeopleFieldMap)
            : null
        );
        setDonationConfig(
          nextDonationInspection
            ? createDatasetImportConfig(nextDonationInspection, createEmptyDonationFieldMap)
            : null
        );

        const warnings = [
          ...(nextPeopleInspection?.warnings ?? []),
          ...(nextDonationInspection?.warnings ?? [])
        ];

        if (warnings.length > 0) {
          onStatusChange(warnings.join(' '));
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          onStatusChange(error instanceof Error ? error.message : 'Source file inspection failed.');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsInspecting(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [donationSourceName, onStatusChange, peopleSourceName, session?.id]);

  const canImport =
    Boolean(peopleInspection && donationInspection && peopleConfig && donationConfig) &&
    !isInspecting &&
    !isImporting;
  const peopleSheet =
    peopleInspection?.sheets.find((sheet) => sheet.name === peopleConfig?.sheetName) ?? null;
  const donationSheet =
    donationInspection?.sheets.find((sheet) => sheet.name === donationConfig?.sheetName) ?? null;

  async function inspectPeopleSource(): Promise<PeopleImportSourceInspection | null> {
    if (!peopleSourceName) {
      return null;
    }

    const result = await window.peopleSearch.imports.inspectImportSource('people');
    return result.dataset === 'people' ? result : null;
  }

  async function inspectDonationSource(): Promise<DonationImportSourceInspection | null> {
    if (!donationSourceName) {
      return null;
    }

    const result = await window.peopleSearch.imports.inspectImportSource('donations');
    return result.dataset === 'donations' ? result : null;
  }

  async function handleImport(): Promise<void> {
    if (!peopleConfig || !donationConfig) {
      return;
    }

    setIsImporting(true);

    try {
      const result = await window.peopleSearch.imports.runImport({
        people: peopleConfig,
        donations: donationConfig
      });
      onImported(result.session, result.summary);
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="import-panel">
      <div className="panel-header">
        <div>
          <h2>Load Your Data</h2>
        </div>
      </div>

      <p className="helper-copy">
        Select your Young People and Youth Subs spreadsheets to begin.
      </p>

      <div className="import-status-grid">
        <div className="status-tile">
          <span className="field-label">Young People File</span>
          <p className="field-value">{peopleSourceName ?? 'No file loaded'}</p>
        </div>
        <div className="status-tile">
          <span className="field-label">Youth Subs File</span>
          <p className="field-value">{donationSourceName ?? 'No file loaded'}</p>
        </div>
        <div className="status-tile">
          <span className="field-label">Field Mapping</span>
          <p className="field-value">
            {isInspecting ? 'Inspecting source files…' : 'Load files to review and map fields'}
          </p>
        </div>
        <div className="status-tile">
          <span className="field-label">Import Status</span>
          <p className="field-value">
            {session?.summary
              ? `${session.summary.peopleCount} people, ${session.summary.donationCount} donations`
              : 'No data imported'}
          </p>
        </div>
      </div>

      <p className="helper-copy">
        <strong>Both files must be loaded before importing.</strong>
      </p>

      <div className="action-row import-action-row">
        <button
          className="secondary-button"
          type="button"
          disabled={isInspecting || isImporting}
          onClick={() => {
            void onChooseImportSource('people');
          }}
        >
          {peopleSourceName ? 'Select Different Young People File' : 'Select Young People File'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={isInspecting || isImporting}
          onClick={() => {
            void onChooseImportSource('donations');
          }}
        >
          {donationSourceName ? 'Select Different Youth Subs File' : 'Select Youth Subs File'}
        </button>
      </div>

      <div className="how-it-works">
        <h3>How it works</h3>
        <ol>
          <li>Select your Young People and Youth Subs files</li>
          <li>Check the detected sheet and headers</li>
          <li>Adjust mappings if needed</li>
          <li>Import and start searching</li>
        </ol>
      </div>

      {peopleInspection || donationInspection ? (
        <>
          <div className="wizard-grid">
            {peopleInspection && peopleConfig ? (
              <DatasetMapper
                title={DATASET_LABELS.people}
                sheet={peopleSheet}
                inspection={peopleInspection}
                fieldKeys={PEOPLE_FIELDS}
                requiredFields={PEOPLE_REQUIRED_FIELDS}
                currentConfig={peopleConfig}
                onConfigChange={setPeopleConfig}
                suggestFieldMap={suggestPeopleFieldMap}
                createEmptyFieldMap={createEmptyPeopleFieldMap}
              />
            ) : (
              <MissingSourceCard dataset="people" />
            )}

            {donationInspection && donationConfig ? (
              <DatasetMapper
                title={DATASET_LABELS.donations}
                sheet={donationSheet}
                inspection={donationInspection}
                fieldKeys={DONATION_FIELDS}
                requiredFields={DONATION_REQUIRED_FIELDS}
                currentConfig={donationConfig}
                onConfigChange={setDonationConfig}
                suggestFieldMap={suggestDonationFieldMap}
                createEmptyFieldMap={createEmptyDonationFieldMap}
              />
            ) : (
              <MissingSourceCard dataset="donations" />
            )}
          </div>

          <div className="action-row import-action-row">
            <button
              className="primary-button"
              type="button"
              disabled={!canImport}
              onClick={() => {
                void handleImport();
              }}
            >
              {isImporting ? 'Importing…' : 'Import Into Local Database'}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

interface DatasetMapperProps<FieldKey extends string> {
  title: string;
  sheet: SheetInspection | null;
  inspection: DatasetSourceInspection<FieldKey>;
  fieldKeys: readonly FieldKey[];
  requiredFields: readonly FieldKey[];
  currentConfig: {
    sheetName: string;
    headerRow: number;
    fieldMap: Record<FieldKey, string | null>;
  };
  onConfigChange: (nextConfig: {
    sheetName: string;
    headerRow: number;
    fieldMap: Record<FieldKey, string | null>;
  }) => void;
  suggestFieldMap: (columns: string[]) => Record<FieldKey, string | null>;
  createEmptyFieldMap: () => Record<FieldKey, string | null>;
}

function DatasetMapper<FieldKey extends string>({
  title,
  sheet,
  inspection,
  fieldKeys,
  requiredFields,
  currentConfig,
  onConfigChange,
  suggestFieldMap,
  createEmptyFieldMap
}: DatasetMapperProps<FieldKey>): JSX.Element {
  const selectedSheet =
    inspection.sheets.find((item) => item.name === currentConfig.sheetName) ?? inspection.sheets[0] ?? null;
  const headerCandidate =
    selectedSheet?.headerCandidates.find((candidate) => candidate.rowNumber === currentConfig.headerRow) ??
    selectedSheet?.headerCandidates[0] ??
    null;
  const availableColumns = headerCandidate?.columns ?? [];

  return (
    <article className="mapping-card">
      <div className="mapping-card-header">
        <h3>{title}</h3>
        <span className="subtle-label">Manual mapping supported</span>
      </div>

      <label className="mapping-label">
        <span className="field-label">Sheet</span>
        <select
          value={selectedSheet?.name ?? ''}
          onChange={(event) => {
            const nextSheet = inspection.sheets.find((item) => item.name === event.target.value) ?? null;
            const nextHeaderCandidate = nextSheet?.headerCandidates[0] ?? null;
            const nextColumns = nextHeaderCandidate?.columns ?? [];

            onConfigChange({
              sheetName: nextSheet?.name ?? '',
              headerRow: nextHeaderCandidate?.rowNumber ?? 1,
              fieldMap: nextColumns.length > 0 ? suggestFieldMap(nextColumns) : createEmptyFieldMap()
            });
          }}
        >
          {inspection.sheets.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mapping-label">
        <span className="field-label">Header row</span>
        <select
          value={currentConfig.headerRow}
          onChange={(event) => {
            const nextHeaderRow = Number(event.target.value);
            const nextCandidate =
              selectedSheet?.headerCandidates.find((candidate) => candidate.rowNumber === nextHeaderRow) ?? null;
            const nextColumns = nextCandidate?.columns ?? [];

            onConfigChange({
              ...currentConfig,
              headerRow: nextHeaderRow,
              fieldMap:
                nextColumns.length > 0
                  ? {
                      ...suggestFieldMap(nextColumns),
                      ...Object.fromEntries(
                        Object.entries(currentConfig.fieldMap).map(([field, value]) => [
                          field,
                          value && nextColumns.includes(value) ? value : null
                        ])
                      )
                    }
                  : createEmptyFieldMap()
            });
          }}
        >
          {(selectedSheet?.headerCandidates ?? []).map((candidate) => (
            <option key={candidate.rowNumber} value={candidate.rowNumber}>
              Row {candidate.rowNumber}
            </option>
          ))}
        </select>
      </label>

      <div className="mapping-grid">
        {fieldKeys.map((fieldKey) => {
          const isRequired = requiredFields.includes(fieldKey);

          return (
            <label className="mapping-label" key={fieldKey}>
              <span className="field-label">
                {FIELD_LABELS[fieldKey as keyof typeof FIELD_LABELS]}
                {isRequired ? ' *' : ' (optional)'}
              </span>
              <select
                value={currentConfig.fieldMap[fieldKey] ?? ''}
                onChange={(event) => {
                  onConfigChange({
                    ...currentConfig,
                    fieldMap: {
                      ...currentConfig.fieldMap,
                      [fieldKey]: event.target.value || null
                    }
                  });
                }}
              >
                <option value="">Not mapped</option>
                {availableColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      {sheet?.previewRows.length ? (
        <div className="preview-table">
          {sheet.previewRows.map((row, rowIndex) => (
            <div className="preview-row" key={`${sheet.name}-${rowIndex}`}>
              {row.slice(0, 8).map((cellValue, cellIndex) => (
                <span className="preview-cell" key={`${sheet.name}-${rowIndex}-${cellIndex}`}>
                  {cellValue || '—'}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function MissingSourceCard({ dataset }: { dataset: DatasetKey }): JSX.Element {
  return (
    <article className="mapping-card">
      <div className="mapping-card-header">
        <h3>{DATASET_LABELS[dataset]}</h3>
        <span className="subtle-label">Source file required</span>
      </div>
      <p className="helper-copy">
        Choose a file for {DATASET_LABELS[dataset]} to inspect its sheets or the single tab in a CSV
        and map the required fields.
      </p>
    </article>
  );
}

function createDatasetImportConfig<FieldKey extends string>(
  inspection: DatasetSourceInspection<FieldKey>,
  createEmptyFieldMap: () => Record<FieldKey, string | null>
): {
  sheetName: string;
  headerRow: number;
  fieldMap: Record<FieldKey, string | null>;
} {
  return {
    sheetName: inspection.suggestion.sheetName ?? inspection.sheets[0]?.name ?? '',
    headerRow: inspection.suggestion.headerRow ?? inspection.sheets[0]?.headerCandidates[0]?.rowNumber ?? 1,
    fieldMap: inspection.suggestion.sheetName ? inspection.suggestion.fieldMap : createEmptyFieldMap()
  };
}