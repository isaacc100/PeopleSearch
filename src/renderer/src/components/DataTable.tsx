import { useMemo, useState, type ReactNode } from 'react';

export interface DataColumn<T> {
  key: string;
  label: string;
  width?: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  copyValue?: (row: T) => string | null | undefined;
}

interface DataTableProps<T extends { id: string }> {
  columns: DataColumn<T>[];
  rows: T[];
  emptyMessage: string;
  selectedRowId?: string | null;
  onRowSelect?: (row: T) => void;
}

export default function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage,
  selectedRowId,
  onRowSelect
}: DataTableProps<T>): JSX.Element {
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() =>
    columns.map((column) => column.key)
  );
  const [sortKey, setSortKey] = useState<string | null>(columns.find((column) => column.sortValue)?.key ?? null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const activeColumns = useMemo(
    () => columns.filter((column) => visibleColumnKeys.includes(column.key)),
    [columns, visibleColumnKeys]
  );

  const sortedRows = useMemo(() => {
    const nextRows = [...rows];
    const sortColumn = columns.find((column) => column.key === sortKey && column.sortValue);

    if (!sortColumn?.sortValue) {
      return nextRows;
    }

    nextRows.sort((leftRow, rightRow) => {
      const leftValue = sortColumn.sortValue?.(leftRow);
      const rightValue = sortColumn.sortValue?.(rightRow);

      if (leftValue === rightValue) {
        return 0;
      }

      if (leftValue === null || leftValue === undefined) {
        return 1;
      }

      if (rightValue === null || rightValue === undefined) {
        return -1;
      }

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      }

      return sortDirection === 'asc'
        ? String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true })
        : String(rightValue).localeCompare(String(leftValue), undefined, { numeric: true });
    });

    return nextRows;
  }, [columns, rows, sortDirection, sortKey]);

  const gridTemplateColumns = activeColumns
    .map((column) => column.width ?? 'minmax(120px, 1fr)')
    .join(' ');

  async function copyValue(value: string | null | undefined): Promise<void> {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Ignore clipboard failures and keep the cell content visible.
    }
  }

  return (
    <div className="table-shell">
      <div className="table-toolbar">
        <span className="field-label">Columns</span>
        <div className="chip-row">
          {columns.map((column) => {
            const visible = visibleColumnKeys.includes(column.key);

            return (
              <button
                className={`toggle-chip ${visible ? 'active' : ''}`}
                key={column.key}
                type="button"
                onClick={() => {
                  setVisibleColumnKeys((currentKeys) => {
                    if (visible) {
                      return currentKeys.filter((key) => key !== column.key);
                    }

                    return [...currentKeys, column.key];
                  });
                }}
              >
                {column.label}
              </button>
            );
          })}
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <p className="helper-copy">{emptyMessage}</p>
      ) : (
        <div className="data-table">
          <div className="data-header" style={{ gridTemplateColumns }}>
            {activeColumns.map((column) => (
              <button
                className="header-button"
                key={column.key}
                type="button"
                onClick={() => {
                  if (!column.sortValue) {
                    return;
                  }

                  if (sortKey === column.key) {
                    setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setSortKey(column.key);
                    setSortDirection('asc');
                  }
                }}
              >
                {column.label}
              </button>
            ))}
          </div>

          <div className="data-body">
            {sortedRows.map((row) => (
              <div
                className={`data-row ${selectedRowId === row.id ? 'selected' : ''}`}
                key={row.id}
                role="button"
                style={{ gridTemplateColumns }}
                tabIndex={0}
                onClick={() => {
                  onRowSelect?.(row);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowSelect?.(row);
                  }
                }}
              >
                {activeColumns.map((column) => (
                  <button
                    className="data-cell"
                    key={`${row.id}-${column.key}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void copyValue(column.copyValue?.(row));
                      onRowSelect?.(row);
                    }}
                  >
                    {column.render(row)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}