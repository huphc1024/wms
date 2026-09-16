import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';

// Nhãn tiếng Việt cho từng feature key. Danh sách key thật lấy từ
// server (all_feature_keys) chứ không hardcode ở đây: nếu backend thêm
// key mới mà trang này chưa có nhãn thì vẫn hiện ra (dùng chính key làm
// nhãn) thay vì biến mất khỏi UI và không ai gán được.
const FEATURE_LABELS = {
  inventory: 'Xem tồn kho của mình',
  orders: 'Đơn xuất & trạng thái',
  inbound: 'Hàng nhập dự kiến',
  invoices: 'Hóa đơn',
  reports: 'Báo cáo',
};

const EMPTY_FORM = { feature_keys: [], must_change_password: true };

async function responseError(res, fallback) {
  const data = await res?.json().catch(() => ({}));
  if (data?.unknown?.length) return `${data.error}: ${data.unknown.join(', ')}`;
  return data?.error || fallback;
}

export default function CustomerUsers() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [allFeatureKeys, setAllFeatureKeys] = useState(Object.keys(FEATURE_LABELS));
  const [form, setForm] = useState(null);
  const [featureForm, setFeatureForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [userRes, customerRes] = await Promise.all([
      api.get('/admin/customer-users?per_page=1000'),
      api.get('/admin/customers'),
    ]);
    if (userRes?.ok) setRows((await userRes.json()).customer_users || []);
    if (customerRes?.ok) setCustomers((await customerRes.json()).customers || []);
  }, []);

  // Initial remote-data hydration is intentionally effect-driven.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const activeCustomers = useMemo(
    () => customers.filter((c) => c.is_active),
    [customers],
  );

  async function save() {
    if (!form?.customer_id) { setError('Phải chọn khách hàng'); return; }
    if (!form.customer_user_id) {
      if (!form.username?.trim()) { setError('Tên đăng nhập là bắt buộc'); return; }
      if (!form.password) { setError('Mật khẩu là bắt buộc'); return; }
      if (!form.full_name?.trim()) { setError('Họ tên là bắt buộc'); return; }
    }
    setSaving(true); setError('');

    let res;
    if (form.customer_user_id) {
      // Chỉ gửi những field endpoint PUT nhận. customer_id không nằm
      // trong đó: đổi khách hàng của một tài khoản sẽ lặng lẽ chuyển
      // hướng mọi truy vấn nó thực hiện, nên đó là xóa-và-tạo-lại chứ
      // không phải sửa. Gửi kèm sẽ bị từ chối 400 (extra="forbid").
      const body = {
        full_name: form.full_name,
        email: form.email || null,
        is_active: form.is_active,
      };
      if (form.password) body.password = form.password;
      res = await api.put(`/admin/customer-users/${form.customer_user_id}`, body);
    } else {
      res = await api.post('/admin/customer-users', {
        customer_id: form.customer_id,
        username: form.username.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        email: form.email || null,
        feature_keys: form.feature_keys || [],
        must_change_password: form.must_change_password !== false,
      });
    }

    setSaving(false);
    if (!res?.ok) { setError(await responseError(res, 'Không lưu được tài khoản')); return; }
    setForm(null); await load();
  }

  async function openFeatures(row) {
    setError('');
    const res = await api.get(`/admin/customer-users/${row.customer_user_id}/features`);
    if (!res?.ok) { setError(await responseError(res, 'Không tải được quyền')); return; }
    const data = await res.json();
    if (data.all_feature_keys?.length) setAllFeatureKeys(data.all_feature_keys);
    setFeatureForm({
      customer_user_id: row.customer_user_id,
      username: row.username,
      feature_keys: data.feature_keys || [],
    });
  }

  async function saveFeatures() {
    setSaving(true); setError('');
    const res = await api.put(
      `/admin/customer-users/${featureForm.customer_user_id}/features`,
      { feature_keys: featureForm.feature_keys },
    );
    setSaving(false);
    if (!res?.ok) { setError(await responseError(res, 'Không lưu được quyền')); return; }
    setFeatureForm(null); await load();
  }

  async function deactivate(row) {
    setError('');
    const res = await api.delete(`/admin/customer-users/${row.customer_user_id}`);
    if (!res?.ok) { setError(await responseError(res, 'Không ngừng được tài khoản')); return; }
    await load();
  }

  function toggleFeature(list, key) {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  }

  const columns = [
    { key: 'username', label: 'Tên đăng nhập' },
    { key: 'full_name', label: 'Họ tên' },
    {
      key: 'customer_code',
      label: 'Khách hàng',
      render: (row) => `${row.customer_code || '-'} · ${row.customer_name || ''}`,
    },
    { key: 'email', label: 'Email', render: (row) => row.email || '-' },
    {
      key: 'feature_keys',
      label: 'Quyền',
      render: (row) => (row.feature_keys?.length
        ? row.feature_keys.map((k) => FEATURE_LABELS[k] || k).join(', ')
        // Không có quyền nào là trạng thái hợp lệ, không phải lỗi: tài
        // khoản vẫn đăng nhập và đổi mật khẩu được, ngoài ra không thấy gì.
        : 'Chưa gán quyền'),
    },
    {
      key: 'must_change_password',
      label: 'Đổi MK lần đầu',
      render: (row) => (row.must_change_password ? 'Bắt buộc' : '-'),
    },
    {
      key: 'last_login',
      label: 'Đăng nhập cuối',
      render: (row) => (row.last_login ? new Date(row.last_login).toLocaleString('vi-VN') : 'Chưa'),
    },
    {
      key: 'is_active',
      label: 'Trạng thái',
      render: (row) => (
        <span className={`status-tag ${row.is_active ? 'status-active' : 'status-cancelled'}`}>
          {row.is_active ? 'Đang hoạt động' : 'Ngừng'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm" onClick={() => { setError(''); setForm({ ...row, password: '' }); }}>Sửa</button>
          <button type="button" className="btn btn-sm" onClick={() => openFeatures(row)}>Quyền</button>
          {row.is_active && (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => deactivate(row)}>Ngừng</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Tài khoản cổng khách hàng">
        <button type="button" className="btn btn-primary" onClick={() => { setError(''); setForm({ ...EMPTY_FORM }); }}>
          Thêm tài khoản
        </button>
      </PageHeader>

      {error && !form && !featureForm && <div className="alert alert-error">{error}</div>}

      <DataTable columns={columns} data={rows} />

      {form && (
        <Modal
          title={form.customer_user_id ? 'Cập nhật tài khoản' : 'Thêm tài khoản khách hàng'}
          onClose={() => setForm(null)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setForm(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </>
          )}
        >
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="cu-customer">Khách hàng *</label>
            <select
              id="cu-customer"
              className="form-input"
              // Không cho đổi sau khi tạo: xem ghi chú trong save().
              disabled={Boolean(form.customer_user_id)}
              value={form.customer_id || ''}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
            >
              <option value="">Chọn khách hàng</option>
              {activeCustomers.map((c) => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.customer_code} · {c.customer_name}
                </option>
              ))}
            </select>
            {form.customer_user_id && (
              <small className="form-hint">
                Không đổi được khách hàng của tài khoản đã tạo. Hãy ngừng tài khoản này và tạo tài khoản mới.
              </small>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cu-username">Tên đăng nhập *</label>
              <input
                id="cu-username"
                className="form-input"
                disabled={Boolean(form.customer_user_id)}
                value={form.username || ''}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="cu-fullname">Họ tên *</label>
              <input
                id="cu-fullname"
                className="form-input"
                value={form.full_name || ''}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cu-email">Email</label>
              <input
                id="cu-email"
                type="email"
                className="form-input"
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="cu-password">
                {form.customer_user_id ? 'Đặt lại mật khẩu' : 'Mật khẩu *'}
              </label>
              <input
                id="cu-password"
                type="password"
                className="form-input"
                placeholder={form.customer_user_id ? 'Để trống nếu không đổi' : ''}
                value={form.password || ''}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              {form.customer_user_id && (
                <small className="form-hint">
                  Đặt lại mật khẩu sẽ đăng xuất mọi phiên đang hoạt động của tài khoản này
                  và bắt đổi mật khẩu ở lần đăng nhập tới.
                </small>
              )}
            </div>
          </div>

          {!form.customer_user_id && (
            <>
              <div className="form-group">
                <label htmlFor="cu-features-new">Quyền truy cập</label>
                <div id="cu-features-new" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {allFeatureKeys.map((key) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={(form.feature_keys || []).includes(key)}
                        onChange={() => setForm({
                          ...form,
                          feature_keys: toggleFeature(form.feature_keys || [], key),
                        })}
                      />
                      {FEATURE_LABELS[key] || key}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={form.must_change_password !== false}
                    onChange={(e) => setForm({ ...form, must_change_password: e.target.checked })}
                  />
                  Bắt đổi mật khẩu ở lần đăng nhập đầu
                </label>
                <small className="form-hint">
                  Nên bật, để bạn không giữ một mật khẩu còn dùng được của khách hàng.
                </small>
              </div>
            </>
          )}

          {form.customer_user_id && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={form.is_active !== false}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Đang hoạt động
              </label>
            </div>
          )}
        </Modal>
      )}

      {featureForm && (
        <Modal
          title={`Quyền của ${featureForm.username}`}
          onClose={() => setFeatureForm(null)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setFeatureForm(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={saveFeatures}>
                {saving ? 'Đang lưu...' : 'Lưu quyền'}
              </button>
            </>
          )}
        >
          {error && <div className="alert alert-error">{error}</div>}
          <p className="form-hint">
            Bỏ hết dấu tick là hợp lệ: tài khoản vẫn đăng nhập và đổi mật khẩu được,
            ngoài ra không thấy dữ liệu nào.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {allFeatureKeys.map((key) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={featureForm.feature_keys.includes(key)}
                  onChange={() => setFeatureForm({
                    ...featureForm,
                    feature_keys: toggleFeature(featureForm.feature_keys, key),
                  })}
                />
                {FEATURE_LABELS[key] || key}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
