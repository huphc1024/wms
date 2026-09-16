/**
 * Minimal read-only table. Deliberately not a copy of admin's DataTable:
 * that one carries row selection, inline edit and per-column permission
 * hooks, none of which a customer-facing read surface should have.
 *
 * columns: [{ key, label, render?, align?, mono? }]
 */
export default function DataTable({
  columns, rows, rowKey, loading, empty, onRowClick,
}) {
  if (loading) {
    return <div className="card-note">Đang tải…</div>;
  }
  if (!rows || rows.length === 0) {
    return <div className="card-note">{empty || 'Không có dữ liệu.'}</div>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'align-right' : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={rowKey ? rowKey(r, i) : i}
              className={onRowClick ? 'row-clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={[
                    c.align === 'right' ? 'align-right' : '',
                    c.mono ? 'mono' : '',
                  ].filter(Boolean).join(' ') || undefined}
                >
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
