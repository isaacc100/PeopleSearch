import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type {
  DonationSearchResult,
  PersonSearchResult,
  SearchBootstrap
} from '../../../../shared/types';
import DataTable, { type DataColumn } from '../../components/DataTable';

interface CombinedViewProps {
  bootstrap: SearchBootstrap;
  selectedPerson: PersonSearchResult | null;
  linkedDonations: DonationSearchResult[];
  onSelectPerson: (person: PersonSearchResult) => void;
}

export default function CombinedView({
  bootstrap,
  selectedPerson,
  linkedDonations,
  onSelectPerson
}: CombinedViewProps): JSX.Element {
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [rows, setRows] = useState<PersonSearchResult[]>([]);

  useEffect(() => {
    let isCancelled = false;

    void window.peopleSearch.search
      .searchPeople({
        text: deferredSearchText,
        filters: {},
        limit: 500
      })
      .then((results) => {
        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setRows(results);
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [deferredSearchText, bootstrap.peopleCount]);

  const peopleColumns = useMemo<DataColumn<PersonSearchResult>[]>(
    () => [
      {
        key: 'fullName',
        label: 'Person',
        width: 'minmax(180px, 1.5fr)',
        render: (row) => row.fullName,
        sortValue: (row) => row.fullName,
        copyValue: (row) => row.fullName
      },
      {
        key: 'county',
        label: 'County',
        render: (row) => row.county ?? '—',
        sortValue: (row) => row.county,
        copyValue: (row) => row.county
      },
      {
        key: 'linkedDonationCount',
        label: 'Linked',
        width: 'minmax(90px, 0.7fr)',
        render: (row) => row.linkedDonationCount,
        sortValue: (row) => row.linkedDonationCount,
        copyValue: (row) => String(row.linkedDonationCount)
      }
    ],
    []
  );

  const donationColumns = useMemo<DataColumn<DonationSearchResult>[]>(
    () => [
      {
        key: 'reference',
        label: 'Reference',
        width: 'minmax(160px, 1.2fr)',
        render: (row) => row.reference ?? '—',
        sortValue: (row) => row.reference,
        copyValue: (row) => row.reference
      },
      {
        key: 'donor',
        label: 'Donor',
        width: 'minmax(160px, 1.2fr)',
        render: (row) => row.donor ?? '—',
        sortValue: (row) => row.donor,
        copyValue: (row) => row.donor
      },
      {
        key: 'email',
        label: 'Email',
        width: 'minmax(180px, 1.3fr)',
        render: (row) => row.email ?? '—',
        sortValue: (row) => row.email,
        copyValue: (row) => row.email
      },
      {
        key: 'linkBasis',
        label: 'Match Basis',
        render: (row) => row.linkBasis,
        sortValue: (row) => row.linkBasis,
        copyValue: (row) => row.linkBasis
      }
    ],
    []
  );

  return (
    <section className="results-panel combined-layout">
      <div className="combined-column">
        <div className="panel-header compact">
          <div>
            <p className="eyebrow">Combined View</p>
            <h2>Select a person to see linked donations</h2>
          </div>
        </div>

        <label className="mapping-label search-field wide">
          <span className="field-label">Person search</span>
          <input
            value={searchText}
            placeholder="Search people for a linked view"
            onChange={(event) => {
              setSearchText(event.target.value);
            }}
          />
        </label>

        <DataTable
          columns={peopleColumns}
          rows={rows}
          emptyMessage="No People rows are available for the combined view yet."
          selectedRowId={selectedPerson?.id ?? null}
          onRowSelect={onSelectPerson}
        />
      </div>

      <div className="combined-column">
        <div className="selection-card">
          <span className="field-label">Selected person</span>
          <h3>{selectedPerson?.fullName ?? 'Choose a person from the left-hand list'}</h3>
          <p className="helper-copy compact">
            {selectedPerson
              ? `${linkedDonations.length} linked donation rows were found for this person.`
              : 'This panel shows the deterministic email/name links created during import.'}
          </p>
        </div>

        <DataTable
          columns={donationColumns}
          rows={linkedDonations}
          emptyMessage="No linked donation rows are available for the selected person."
        />
      </div>
    </section>
  );
}