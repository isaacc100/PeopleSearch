import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { PersonSearchResult, SearchBootstrap } from '../../../../shared/types';
import DataTable, { type DataColumn } from '../../components/DataTable';

interface PeopleViewProps {
  bootstrap: SearchBootstrap;
  selectedPersonId: string | null;
  onSelectPerson: (person: PersonSearchResult) => void;
}

export default function PeopleView({
  bootstrap,
  selectedPersonId,
  onSelectPerson
}: PeopleViewProps): JSX.Element {
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [filters, setFilters] = useState({
    roleName: '',
    group: '',
    county: '',
    region: ''
  });
  const [rows, setRows] = useState<PersonSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    void window.peopleSearch.search
      .searchPeople({
        text: deferredSearchText,
        filters: {
          roleName: filters.roleName || undefined,
          group: filters.group || undefined,
          county: filters.county || undefined,
          region: filters.region || undefined
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

  const columns = useMemo<DataColumn<PersonSearchResult>[]>(
    () => [
      {
        key: 'personNumber',
        label: 'Person Number',
        width: 'minmax(110px, 0.9fr)',
        render: (row) => row.personNumber ?? '—',
        sortValue: (row) => row.personNumber,
        copyValue: (row) => row.personNumber
      },
      {
        key: 'fullName',
        label: 'Full Name',
        width: 'minmax(180px, 1.5fr)',
        render: (row) => row.fullName,
        sortValue: (row) => row.fullName,
        copyValue: (row) => row.fullName
      },
      {
        key: 'roleName',
        label: 'Role',
        render: (row) => row.roleName ?? '—',
        sortValue: (row) => row.roleName,
        copyValue: (row) => row.roleName
      },
      {
        key: 'group',
        label: 'Group',
        render: (row) => row.group ?? '—',
        sortValue: (row) => row.group,
        copyValue: (row) => row.group
      },
      {
        key: 'county',
        label: 'County',
        render: (row) => row.county ?? '—',
        sortValue: (row) => row.county,
        copyValue: (row) => row.county
      },
      {
        key: 'region',
        label: 'Region',
        render: (row) => row.region ?? '—',
        sortValue: (row) => row.region,
        copyValue: (row) => row.region
      },
      {
        key: 'linkedDonationCount',
        label: 'Linked Donations',
        width: 'minmax(120px, 0.8fr)',
        render: (row) => row.linkedDonationCount,
        sortValue: (row) => row.linkedDonationCount,
        copyValue: (row) => String(row.linkedDonationCount)
      }
    ],
    []
  );

  return (
    <section className="results-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">People</p>
          <h2>Search and filter People data</h2>
        </div>
        <span className="subtle-label">{isLoading ? 'Searching…' : `${rows.length} rows`}</span>
      </div>

      <div className="filters-grid">
        <label className="mapping-label search-field wide">
          <span className="field-label">Name search</span>
          <input
            value={searchText}
            placeholder="Try jo sm or smi"
            onChange={(event) => {
              setSearchText(event.target.value);
            }}
          />
        </label>

        <SelectFilter
          label="Role"
          value={filters.roleName}
          options={bootstrap.roleNames}
          onChange={(value) => {
            setFilters((currentFilters) => ({ ...currentFilters, roleName: value }));
          }}
        />
        <SelectFilter
          label="Group"
          value={filters.group}
          options={bootstrap.groups}
          onChange={(value) => {
            setFilters((currentFilters) => ({ ...currentFilters, group: value }));
          }}
        />
        <SelectFilter
          label="County"
          value={filters.county}
          options={bootstrap.counties}
          onChange={(value) => {
            setFilters((currentFilters) => ({ ...currentFilters, county: value }));
          }}
        />
        <SelectFilter
          label="Region"
          value={filters.region}
          options={bootstrap.regions}
          onChange={(value) => {
            setFilters((currentFilters) => ({ ...currentFilters, region: value }));
          }}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="No People rows matched the current search and filters."
        selectedRowId={selectedPersonId}
        onRowSelect={onSelectPerson}
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