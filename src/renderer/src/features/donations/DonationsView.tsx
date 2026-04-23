import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { DonationSearchResult, SearchBootstrap } from '../../../../shared/types';
import DataTable, { type DataColumn } from '../../components/DataTable';

interface DonationsViewProps {
  bootstrap: SearchBootstrap;
}

export default function DonationsView({ bootstrap }: DonationsViewProps): JSX.Element {
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [filters, setFilters] = useState({
    campaign: '',
    frequency: '',
    status: ''
  });
  const [rows, setRows] = useState<DonationSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    void window.peopleSearch.search
      .searchDonations({
        text: deferredSearchText,
        filters: {
          campaign: filters.campaign || undefined,
          frequency: filters.frequency || undefined,
          status: filters.status || undefined
        },
        limit: 1000
      })
      .then((results) => {
        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setRows(results);
        });
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [deferredSearchText, filters]);

  const columns = useMemo<DataColumn<DonationSearchResult>[]>(
    () => [
      {
        key: 'reference',
        label: 'Reference',
        width: 'minmax(180px, 1.3fr)',
        render: (row) => row.reference ?? '—',
        sortValue: (row) => row.reference,
        copyValue: (row) => row.reference
      },
      {
        key: 'donor',
        label: 'Donor',
        width: 'minmax(180px, 1.3fr)',
        render: (row) => row.donor ?? '—',
        sortValue: (row) => row.donor,
        copyValue: (row) => row.donor
      },
      {
        key: 'email',
        label: 'Email',
        width: 'minmax(200px, 1.4fr)',
        render: (row) => row.email ?? '—',
        sortValue: (row) => row.email,
        copyValue: (row) => row.email
      },
      {
        key: 'campaign',
        label: 'Campaign',
        render: (row) => row.campaign ?? '—',
        sortValue: (row) => row.campaign,
        copyValue: (row) => row.campaign
      },
      {
        key: 'frequency',
        label: 'Frequency',
        render: (row) => row.frequency ?? '—',
        sortValue: (row) => row.frequency,
        copyValue: (row) => row.frequency
      },
      {
        key: 'status',
        label: 'Status',
        render: (row) => row.status ?? '—',
        sortValue: (row) => row.status,
        copyValue: (row) => row.status
      },
      {
        key: 'nextPaymentDate',
        label: 'Next Payment',
        width: 'minmax(120px, 0.9fr)',
        render: (row) => row.nextPaymentDate ?? '—',
        sortValue: (row) => row.nextPaymentDate,
        copyValue: (row) => row.nextPaymentDate
      },
      {
        key: 'linkBasis',
        label: 'Match Basis',
        width: 'minmax(120px, 0.9fr)',
        render: (row) => row.linkBasis,
        sortValue: (row) => row.linkBasis,
        copyValue: (row) => row.linkBasis
      }
    ],
    []
  );

  return (
    <section className="results-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Donations</p>
          <h2>Search donor, reference, and email</h2>
        </div>
        <span className="subtle-label">{isLoading ? 'Searching…' : `${rows.length} rows`}</span>
      </div>

      <div className="filters-grid">
        <label className="mapping-label search-field wide">
          <span className="field-label">Donation search</span>
          <input
            value={searchText}
            placeholder="Search reference, donor, or email"
            onChange={(event) => {
              setSearchText(event.target.value);
            }}
          />
        </label>
        <SelectFilter
          label="Campaign"
          value={filters.campaign}
          options={bootstrap.campaigns}
          onChange={(value) => {
            setFilters((currentFilters) => ({ ...currentFilters, campaign: value }));
          }}
        />
        <SelectFilter
          label="Frequency"
          value={filters.frequency}
          options={bootstrap.frequencies}
          onChange={(value) => {
            setFilters((currentFilters) => ({ ...currentFilters, frequency: value }));
          }}
        />
        <SelectFilter
          label="Status"
          value={filters.status}
          options={bootstrap.statuses}
          onChange={(value) => {
            setFilters((currentFilters) => ({ ...currentFilters, status: value }));
          }}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="No Donation rows matched the current search and filters."
      />
    </section>
  );
}

interface SelectFilterProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function SelectFilter({ label, value, options, onChange }: SelectFilterProps): JSX.Element {
  return (
    <label className="mapping-label search-field">
      <span className="field-label">{label}</span>
      <select
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}