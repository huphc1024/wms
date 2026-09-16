import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useWarehouse } from '../warehouse.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useDirtyFormGuard } from '../hooks/useDirtyFormGuard.js';

export default function Settings() {
  const { warehouseId } = useWarehouse();
  const [warehouse, setWarehouse] = useState(null);
  const [whForm, setWhForm] = useState({});
  const [editingWh, setEditingWh] = useState(false);

  // Settings with save button
  const [savedSettings, setSavedSettings] = useState({});
  const [draftSettings, setDraftSettings] = useState({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [receivingBins, setReceivingBins] = useState([]);

  const hasUnsavedChanges = JSON.stringify(savedSettings) !== JSON.stringify(draftSettings);

  // v1.4.2 #100: browser-level warning only. Hook owns the
  // beforeunload listener. Intra-SPA sidebar clicks are NOT guarded;
  // deferred to v1.5 along with the rest of the design question.
  useDirtyFormGuard(hasUnsavedChanges);

  useEffect(() => {
    if (!warehouseId) return;
    api.get(`/admin/warehouses/${warehouseId}`).then(async (res) => {
      if (res?.ok) {
        const data = await res.json();
        setWarehouse(data);
        setWhForm(data);
      }
    });

    // Load all settings
    Promise.all([
      api.get('/admin/settings/count_show_expected'),
      api.get('/admin/settings/require_packing_before_shipping'),
      api.get('/admin/settings/allow_over_receiving'),
      api.get('/admin/settings/default_receiving_bin'),
      api.get('/admin/settings/require_count_approval_separation'),
      api.get('/admin/settings/picking_ticket_company_name'),
      api.get('/admin/settings/picking_ticket_company_address'),
      api.get('/admin/settings/picking_ticket_logo_url'),
      api.get('/admin/settings/picking_ticket_returns_text'),
      api.get('/admin/settings/pos_activity_enabled'),
      api.get('/admin/settings/fraud_review_billing_shipping'),
      api.get('/admin/settings/dashboard_bubble_origins'),
    ]).then(async (responses) => {
      const initial = {};
      for (const res of responses) {
        if (res?.ok) {
          const data = await res.json();
          initial[data.key] = data.value;
        }
      }
      // Set defaults for missing settings
      if (!('count_show_expected' in initial)) initial.count_show_expected = 'true';
      if (!('require_packing_before_shipping' in initial)) initial.require_packing_before_shipping = 'true';
      if (!('allow_over_receiving' in initial)) initial.allow_over_receiving = 'true';
      if (!('default_receiving_bin' in initial)) initial.default_receiving_bin = '';
      if (!('require_count_approval_separation' in initial)) initial.require_count_approval_separation = 'false';
      // Picking-ticket / packing-slip branding. All default to empty so a
      // fresh install prints a clean, unbranded slip until an operator
      // fills these in.
      if (!('picking_ticket_company_name' in initial)) initial.picking_ticket_company_name = '';
      if (!('picking_ticket_company_address' in initial)) initial.picking_ticket_company_address = '';
      if (!('picking_ticket_logo_url' in initial)) initial.picking_ticket_logo_url = '';
      if (!('picking_ticket_returns_text' in initial)) initial.picking_ticket_returns_text = '';
      // POS Activity tab is hidden by default; deployments using the POS
      // checkout surface opt in. Sidebar reads the same key to gate the nav.
      if (!('pos_activity_enabled' in initial)) initial.pos_activity_enabled = 'false';
      // Billing != shipping fraud heuristic is opt-in: off by default so
      // a fresh install never parks orders in FRAUD_REVIEW automatically.
      if (!('fraud_review_billing_shipping' in initial)) initial.fraud_review_billing_shipping = 'false';
      // Marketplace Health bubble set: a JSON array of {origin, label}. Empty
      // by default so the dashboard surfaces no channels until an operator
      // adds them; the dashboard endpoint reads the same key.
      if (!('dashboard_bubble_origins' in initial)) initial.dashboard_bubble_origins = '[]';
      setSavedSettings({ ...initial });
      setDraftSettings({ ...initial });
    });

    api.get(`/admin/bins?warehouse_id=${warehouseId}&bin_type=Staging`).then(async (res) => {
      if (res?.ok) {
        const data = await res.json();
        setReceivingBins(data.bins || []);
      }
    }).catch(() => {
      api.get(`/admin/bins?warehouse_id=${warehouseId}`).then(async (res) => {
        if (res?.ok) {
          const data = await res.json();
          setReceivingBins((data.bins || []).filter((b) => b.bin_type === 'Staging'));
        }
      }).catch(() => {});
    });
  }, [warehouseId]);

  function updateDraft(key, value) {
    setDraftSettings((prev) => ({ ...prev, [key]: value }));
    setSettingsSuccess('');
  }

  // Marketplace Health bubble set is stored as a JSON string in
  // draftSettings.dashboard_bubble_origins; parse / mutate / re-serialize
  // around the flat string the settings store keeps.
  function bubbleRows() {
    try {
      const parsed = JSON.parse(draftSettings.dashboard_bubble_origins || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function setBubbleRows(rows) {
    updateDraft('dashboard_bubble_origins', JSON.stringify(rows));
  }

  function updateBubble(i, field, value) {
    const rows = bubbleRows();
    rows[i] = { ...rows[i], [field]: value };
    setBubbleRows(rows);
  }

  function addBubble() {
    setBubbleRows([...bubbleRows(), { origin: '', label: '' }]);
  }

  function removeBubble(i) {
    const rows = bubbleRows();
    rows.splice(i, 1);
    setBubbleRows(rows);
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsError('');
    setSettingsSuccess('');
    const res = await api.put('/admin/settings', { settings: draftSettings });
    if (res?.ok) {
      setSavedSettings({ ...draftSettings });
      setSettingsSuccess('Settings saved');
    } else {
      const data = await res?.json();
      setSettingsError(data?.error || 'Failed to save settings');
    }
    setSettingsSaving(false);
  }

  async function saveWarehouse() {
    const res = await api.put(`/admin/warehouses/${warehouseId}`, { warehouse_name: whForm.warehouse_name, address: whForm.address });
    if (res?.ok) {
      setWarehouse(await res.json());
      setEditingWh(false);
    }
  }

  const toBool = (v) => v !== 'false' && v !== false;

  return (
    <div>
      <PageHeader title="Settings" />

      {/* Warehouse config */}
      <div className="settings-section">
        <h3>Warehouse</h3>
        {warehouse && !editingWh && (
          <div>
            <div className="detail-grid" style={{ marginBottom: 12 }}>
              <span className="detail-label">Name</span><span>{warehouse.warehouse_name}</span>
              <span className="detail-label">Code</span><span className="mono">{warehouse.warehouse_code}</span>
              <span className="detail-label">Address</span><span>{warehouse.address || '-'}</span>
            </div>
            <button className="btn btn-sm" onClick={() => setEditingWh(true)}>Edit</button>
          </div>
        )}
        {editingWh && (
          <div>
            <div className="form-group">
              <label>Name</label>
              <input className="form-input" value={whForm.warehouse_name || ''} onChange={(e) => setWhForm({ ...whForm, warehouse_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input className="form-input" value={whForm.address || ''} onChange={(e) => setWhForm({ ...whForm, address: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setEditingWh(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveWarehouse}>Save</button>
            </div>
          </div>
        )}
      </div>

      {/* Fulfillment Workflow */}
      <div className="settings-section">
        <h3>Fulfillment Workflow</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={toBool(draftSettings.require_packing_before_shipping)}
              onChange={(e) => updateDraft('require_packing_before_shipping', String(e.target.checked))}
            />
            Require packing before shipping
          </label>
        </div>
        <p className="settings-note">When enabled, orders must be packed before they can be shipped. When disabled, picked orders can be shipped directly.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', marginTop: 8 }}>
          <label style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Default Receiving Bin</label>
          <select
            className="form-select"
            style={{ width: 200 }}
            value={draftSettings.default_receiving_bin || ''}
            onChange={(e) => updateDraft('default_receiving_bin', e.target.value)}
          >
            <option value="">Select bin...</option>
            {receivingBins.map((b) => (
              <option key={b.bin_id} value={String(b.bin_id)}>{b.bin_code}</option>
            ))}
          </select>
        </div>
        <p className="settings-note">The default bin where received items are staged. Mobile users can override this per session.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={toBool(draftSettings.allow_over_receiving)}
              onChange={(e) => updateDraft('allow_over_receiving', String(e.target.checked))}
            />
            Allow over-receiving
          </label>
        </div>
        <p className="settings-note">When enabled, users can receive more than the PO quantity (with a warning). When disabled, over-receiving is blocked.</p>
      </div>

      {/* Mobile App Settings */}
      <div className="settings-section">
        <h3>Mobile App</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={toBool(draftSettings.count_show_expected)}
              onChange={(e) => updateDraft('count_show_expected', String(e.target.checked))}
            />
            Show expected quantities during cycle counts
          </label>
        </div>
        <p className="settings-note">When disabled, counters won't see expected quantities - useful for blind counts.</p>
      </div>

      {/* Inventory */}
      <div className="settings-section">
        <h3>Inventory</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={toBool(draftSettings.require_count_approval_separation)}
              onChange={(e) => updateDraft('require_count_approval_separation', String(e.target.checked))}
            />
            Require separate approver for cycle count adjustments
          </label>
        </div>
        <p className="settings-note">When enabled, the admin who performed a cycle count cannot approve the resulting adjustments. A different admin must review and approve.</p>
      </div>

      <div className="settings-section">
        <h3>POS</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={toBool(draftSettings.pos_activity_enabled)}
              onChange={(e) => updateDraft('pos_activity_enabled', String(e.target.checked))}
            />
            Show the POS Activity dashboard
          </label>
        </div>
        <p className="settings-note">Adds a POS Activity tab to the Outbound nav with point-of-sale order activity and daily KPIs. Off by default; enable it for deployments that use the POS checkout surface.</p>
      </div>

      <div className="settings-section">
        <h3>Fraud Review</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={toBool(draftSettings.fraud_review_billing_shipping)}
              onChange={(e) => updateDraft('fraud_review_billing_shipping', String(e.target.checked))}
            />
            Auto-flag orders where billing and shipping addresses differ
          </label>
        </div>
        <p className="settings-note">One built-in heuristic for the Outbound &gt; Fraud queue: when on, an inbound order whose billing and shipping addresses diverge (street / city / state / postal, both sides populated) lands in FRAUD_REVIEW and is held out of picking until a CSR clears it. Off by default. A CSR can always flag or clear an order manually regardless of this setting.</p>
      </div>

      <div className="settings-section">
        <h3>Marketplace Health</h3>
        <p className="settings-note">
          Channels shown on the Dashboard &gt; Marketplace Health view. Origin is
          matched verbatim against each sales order's <code>order_origin</code>
          value (the label the inbound channel mapping writes, or
          &quot;Phone Order&quot; for POS phone orders); Label is the display name
          on the bubble. With no channels configured the view shows nothing -- add
          one row per channel you want a health bubble for.
        </p>
        {bubbleRows().map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', maxWidth: 560, alignItems: 'center' }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              value={b.origin || ''}
              onChange={(e) => updateBubble(i, 'origin', e.target.value)}
              placeholder="order_origin value (e.g. AMAZON)"
            />
            <input
              className="form-input"
              style={{ flex: 1 }}
              value={b.label || ''}
              onChange={(e) => updateBubble(i, 'label', e.target.value)}
              placeholder="Display label (e.g. Amazon)"
            />
            <button type="button" className="btn btn-secondary" onClick={() => removeBubble(i)}>
              Remove
            </button>
          </div>
        ))}
        <div style={{ padding: '8px 0' }}>
          <button type="button" className="btn btn-secondary" onClick={addBubble}>
            Add channel
          </button>
        </div>
      </div>

      {/* Picking Ticket branding */}
      <div className="settings-section">
        <h3>Picking Ticket</h3>
        <p className="settings-note">
          Branding for the printable packing slip (Outbound &gt; Picking Tickets).
          All fields are optional; leave them blank for a clean, unbranded slip.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', maxWidth: 480 }}>
          <label style={{ fontSize: 13 }}>Company name</label>
          <input
            className="form-input"
            value={draftSettings.picking_ticket_company_name || ''}
            onChange={(e) => updateDraft('picking_ticket_company_name', e.target.value)}
            placeholder="e.g. Acme Distribution"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', maxWidth: 480 }}>
          <label style={{ fontSize: 13 }}>Company address</label>
          <textarea
            className="form-input"
            rows={4}
            value={draftSettings.picking_ticket_company_address || ''}
            onChange={(e) => updateDraft('picking_ticket_company_address', e.target.value)}
            placeholder={'One line per row, e.g.\n123 Warehouse Way\nSuite 100\nCity ST 00000'}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', maxWidth: 480 }}>
          <label style={{ fontSize: 13 }}>Logo URL</label>
          <input
            className="form-input"
            value={draftSettings.picking_ticket_logo_url || ''}
            onChange={(e) => updateDraft('picking_ticket_logo_url', e.target.value)}
            placeholder="/picking-tickets/logo.png or https://..."
          />
          <p className="settings-note">Path or URL to a logo image shown in the slip header. Blank hides it.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', maxWidth: 480 }}>
          <label style={{ fontSize: 13 }}>Returns text</label>
          <textarea
            className="form-input"
            rows={3}
            value={draftSettings.picking_ticket_returns_text || ''}
            onChange={(e) => updateDraft('picking_ticket_returns_text', e.target.value)}
            placeholder="e.g. Returns accepted within 30 days. See example.com/returns."
          />
        </div>
      </div>

      {/* Save button */}
      <div className="settings-section" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={saveSettings} disabled={!hasUnsavedChanges || settingsSaving}>
          {settingsSaving ? 'Saving...' : 'Save Settings'}
        </button>
        {hasUnsavedChanges && <span style={{ fontSize: 12, color: 'var(--copper)' }}>Unsaved changes</span>}
        {settingsSuccess && <span style={{ fontSize: 12, color: 'var(--success)' }}>{settingsSuccess}</span>}
        {settingsError && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{settingsError}</span>}
      </div>

      {/* About */}
      <div className="settings-section">
        <h3>About</h3>
        <div className="detail-grid">
          <span className="detail-label">Version</span><span className="mono">1.29.1</span>
          <span className="detail-label">Repository</span><span><a href="https://github.com/hightower-systems/sentry-wms" target="_blank" rel="noopener noreferrer">github.com/hightower-systems/sentry-wms</a></span>
        </div>
      </div>

      {/* PO Modal */}

    </div>
  );
}
