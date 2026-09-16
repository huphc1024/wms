import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useWarehouse } from '../warehouse.jsx';
import { useLocale } from '../i18n/locale.jsx';

// Each NAV item carries a page_key matching api/constants.py
// ALL_PAGE_KEYS. Sidebar filters by the user's allowed_pages so a
// USER without the grant never sees the link (and the backend
// rejects direct URL hits via @require_admin_or_page_permission).
// Dashboard intentionally has no page_key: it is reachable by any
// authenticated user so the badges below populate.
const NAV = [
  {
    label: 'Floor',
    labelKey: 'nav.floor',
    items: [
      { to: '/', label: 'Dashboard', labelKey: 'nav.dashboard', pageKey: 'dashboard' },
      { to: '/inventory', label: 'Inventory', labelKey: 'nav.inventory', pageKey: 'inventory' },
      { to: '/cycle-counts', label: 'Counts', labelKey: 'nav.counts', pageKey: 'cycle-counts' },
      { to: '/count-approvals', label: 'Approvals', labelKey: 'nav.approvals', pageKey: 'count-approvals' },
    ],
  },
  {
    label: 'Inbound',
    labelKey: 'nav.inbound',
    items: [
      { to: '/purchase-orders', label: 'Purchase Orders', labelKey: 'nav.purchaseOrders', pageKey: 'purchase-orders' },
      { to: '/receiving', label: 'Receiving', labelKey: 'nav.receiving', pageKey: 'receiving' },
      { to: '/putaway', label: 'Put-away', labelKey: 'nav.putaway', pageKey: 'putaway' },
    ],
  },
  {
    label: 'Outbound',
    labelKey: 'nav.outbound',
    items: [
      { to: '/sales-orders', label: 'Sales Orders', labelKey: 'nav.salesOrders', pageKey: 'sales-orders' },
      { to: '/pos-activity', label: 'POS Activity', labelKey: 'nav.posActivity', pageKey: 'pos-activity' },
      { to: '/fraud', label: 'Fraud', labelKey: 'nav.fraud', pageKey: 'fraud' },
      { to: '/backorders', label: 'Backorders', labelKey: 'nav.backorders', pageKey: 'backorders' },
      { to: '/picking-tickets', label: 'Picking Tickets', labelKey: 'nav.pickingTickets', pageKey: 'picking-tickets' },
      { to: '/returns', label: 'Returns', labelKey: 'nav.returns', pageKey: 'sales-orders' },
      { to: '/picking-batches', label: 'Picking Batches', labelKey: 'nav.pickingBatches', pageKey: 'picking-batches' },
    ],
  },
  {
    label: 'Warehouse',
    labelKey: 'nav.warehouse',
    items: [
      { to: '/warehouse-simulation', label: 'Simulation', labelKey: 'nav.simulation', pageKey: 'warehouse-simulation' },
      { to: '/items', label: 'Items', labelKey: 'nav.items', pageKey: 'items' },
      { to: '/vendors', label: 'Vendors', labelKey: 'nav.vendors', pageKey: 'vendors' },
      { to: '/adjustments', label: 'Inventory Adjustments', labelKey: 'nav.adjustments', pageKey: 'adjustments' },
      { to: '/inter-warehouse-transfers', label: 'Inventory Transfers', labelKey: 'nav.transfers', pageKey: 'inter-warehouse-transfers' },
      { to: '/transfer-orders', label: 'Transfer Orders', labelKey: 'nav.transferOrders', pageKey: 'transfer-orders' },
        { to: '/data', label: 'Data', labelKey: 'nav.data', pageKeys: ['warehouses', 'bins', 'zones', 'preferred-bins'] },
        { to: '/pallets', label: 'Pallets', labelKey: 'nav.pallets', pageKey: 'pallets' },
        { to: '/expiry', label: 'Expiry', labelKey: 'nav.expiry', pageKey: 'expiry' },
        { to: '/vehicle-movements', label: 'Vehicle Movements', labelKey: 'nav.vehicleMovements', pageKey: 'vehicle-movements' },
    ],
  },
    {
      label: 'Billing',
      labelKey: 'nav.billing',
      items: [
        { to: '/customers', label: 'Customers & Contracts', labelKey: 'nav.customers', pageKey: 'billing' },
        { to: '/rate-cards', label: 'Rate Cards', labelKey: 'nav.rateCards', pageKey: 'billing' },
        { to: '/invoices', label: 'Invoices', labelKey: 'nav.invoices', pageKey: 'billing' },
      ],
    },
  {
    label: 'System',
    labelKey: 'nav.system',
    items: [
      { to: '/users', label: 'Users', labelKey: 'nav.users', pageKey: 'users' },
      { to: '/customer-users', label: 'Portal accounts', labelKey: 'nav.customerUsers', pageKey: 'customer-users' },
      { to: '/api-tokens', label: 'API tokens', labelKey: 'nav.apiTokens', pageKey: 'api-tokens' },
      { to: '/inbound', label: 'Inbound activity', labelKey: 'nav.inboundActivity', pageKey: 'inbound' },
      { to: '/consumer-groups', label: 'Consumer groups', labelKey: 'nav.consumerGroups', pageKey: 'consumer-groups' },
      { to: '/webhooks', label: 'Webhooks', labelKey: 'nav.webhooks', pageKey: 'webhooks' },
      { to: '/channels', label: 'Channels', labelKey: 'nav.channels', pageKey: 'channels' },
      { to: '/notifications', label: 'Notifications', labelKey: 'nav.notifications', pageKey: 'notifications' },
      { to: '/audit-log', label: 'Audit log', labelKey: 'nav.auditLog', pageKey: 'audit-log' },
      { to: '/imports', label: 'Import', labelKey: 'nav.import', pageKey: 'imports' },
      { to: '/integrations', label: 'Integrations', labelKey: 'nav.integrations', pageKey: 'integrations' },
      { to: '/settings', label: 'Settings', labelKey: 'nav.settings', pageKey: 'settings' },
    ],
  },
];

function canSeeNavItem(user, item) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const allowed = user.allowed_pages;
  if (!Array.isArray(allowed)) return false;
  if (item.pageKeys) {
    return item.pageKeys.some((k) => allowed.includes(k));
  }
  if (item.pageKey) {
    return allowed.includes(item.pageKey);
  }
  return true;
}

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const { warehouseId } = useWarehouse();
  const { t } = useLocale();
  const [counts, setCounts] = useState({});
  // The POS Activity tab is opt-in via the pos_activity_enabled setting
  // so non-POS deployments never see it. Default false: the entry is
  // hidden until an operator turns it on in Settings > POS. Silent on
  // permission denial so a USER without the settings grant just gets
  // the default (hidden) rather than a Permissions Error popup.
  const [posActivityEnabled, setPosActivityEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(
      '/admin/settings/pos_activity_enabled',
      { silentPermissionDenied: true },
    ).then(async (res) => {
      if (!res?.ok || cancelled) return;
      const data = await res.json();
      setPosActivityEnabled(data?.value === 'true');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!warehouseId) return;
    // Same silent treatment for the dashboard counts (sidebar badges).
    // /admin/dashboard is intentionally any-auth so this typically
    // succeeds, but a future tightening should not blow up the UI
    // with a modal on every page load.
    api.get(
      `/admin/dashboard?warehouse_id=${warehouseId}`,
      { silentPermissionDenied: true },
    ).then(async (res) => {
      if (!res || !res.ok) return;
      const data = await res.json();
      setCounts({
        '/receiving': data.open_pos || 0,
        '/putaway': data.pending_putaway || 0,
        '/count-approvals': data.pending_adjustments || 0,
        // /picking, /packing, /shipping badges were removed alongside
        // their retired nav entries; the throughput counts still live
        // on the Dashboard page itself.
        // v1.8.0 (#296): pending TO approvals scoped to the active
        // warehouse (source OR destination match). Falls back to 0
        // when the dashboard endpoint is the older shape.
        '/transfer-orders': data.pending_to_approvals || 0,
      });
    });
  }, [location.pathname, warehouseId]);

  const navGroups = (posActivityEnabled
    ? NAV
    : NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.to !== '/pos-activity'),
      }))
  ).map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeNavItem(user, item)),
  })).filter((group) => group.items.length > 0);

  // Per-section collapse, persisted so a hidden section stays hidden across
  // reloads. The header carries a caret; clicking it toggles its items.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sidebar.collapsed') || '{}');
    } catch {
      return {};
    }
  });
  function toggleGroup(label) {
    setCollapsed((c) => {
      const next = { ...c, [label]: !c[label] };
      try {
        localStorage.setItem('sidebar.collapsed', JSON.stringify(next));
      } catch {
        /* ignore quota / private-mode write failures */
      }
      return next;
    });
  }

  return (
    <nav className="sidebar">
      {navGroups.map((group) => {
        const isCollapsed = !!collapsed[group.label];
        return (
          <div key={group.label} className="sidebar-card">
            <div
              className="sidebar-group-label"
              role="button"
              tabIndex={0}
              aria-expanded={!isCollapsed}
              onClick={() => toggleGroup(group.label)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleGroup(group.label);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span>{group.labelKey ? t(group.labelKey, group.label) : group.label}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }} aria-hidden>
                {isCollapsed ? '▸' : '▾'}
              </span>
            </div>
            {!isCollapsed && group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' active' : ''}`
                }
              >
                <span>{item.labelKey ? t(item.labelKey, item.label) : item.label}</span>
                {counts[item.to] > 0 && (
                  <span className="sidebar-badge">{counts[item.to]}</span>
                )}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
