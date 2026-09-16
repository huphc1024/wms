/**
 * Page stepper for the portal lists. Every portal list endpoint returns
 * {page, page_size, total}, so the control can be driven off that alone
 * without a per-page "has more" probe.
 */
export default function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (pageSize || 1)));
  if ((total || 0) <= (pageSize || 0)) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span className="text-muted">
        {from}–{to} / {total}
      </span>
      <div className="pagination-buttons">
        <button
          type="button"
          className="btn btn-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Trước
        </button>
        <span className="text-muted">Trang {page}/{pages}</span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Sau
        </button>
      </div>
    </div>
  );
}
