-- WMS Warehouse Simulation — PostgreSQL schema
-- Event-sourced inventory ledger; location hierarchy for map + routing

-- =============================================================================
-- 1. Location hierarchy
-- =============================================================================

CREATE TABLE warehouses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(32) UNIQUE NOT NULL,
  name        VARCHAR(128) NOT NULL,
  address     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE zones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id),
  code          VARCHAR(32) NOT NULL,
  name          VARCHAR(128) NOT NULL,
  zone_type     VARCHAR(32) NOT NULL,  -- receiving|storage|qc|packing|shipping|staging
  color_hex     VARCHAR(7) DEFAULT '#4A90D9',
  map_x         NUMERIC(8,2),
  map_y         NUMERIC(8,2),
  map_w         NUMERIC(8,2),
  map_h         NUMERIC(8,2),
  UNIQUE (warehouse_id, code)
);

CREATE TABLE aisles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id   UUID NOT NULL REFERENCES zones(id),
  code      VARCHAR(16) NOT NULL,
  direction VARCHAR(8) DEFAULT 'both',  -- one_way|both
  map_x     NUMERIC(8,2),
  map_y     NUMERIC(8,2),
  UNIQUE (zone_id, code)
);

CREATE TABLE racks (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aisle_id  UUID NOT NULL REFERENCES aisles(id),
  code      VARCHAR(16) NOT NULL,
  levels    INT DEFAULT 1,
  UNIQUE (aisle_id, code)
);

CREATE TABLE bins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_id       UUID NOT NULL REFERENCES racks(id),
  code          VARCHAR(32) NOT NULL,
  barcode       VARCHAR(64) UNIQUE NOT NULL,
  capacity_qty  INT DEFAULT 100,
  capacity_kg   NUMERIC(10,2),
  status        VARCHAR(16) DEFAULT 'empty',  -- empty|partial|full|blocked|quarantine
  map_x         NUMERIC(8,2) NOT NULL,
  map_y         NUMERIC(8,2) NOT NULL,
  map_w         NUMERIC(8,2) DEFAULT 10,
  map_h         NUMERIC(8,2) DEFAULT 8,
  velocity      VARCHAR(8) DEFAULT 'medium',  -- fast|medium|slow
  UNIQUE (rack_id, code)
);

CREATE TABLE location_nodes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  node_type    VARCHAR(16) NOT NULL,  -- bin|junction|dock|staging
  ref_id       UUID,
  map_x        NUMERIC(8,2) NOT NULL,
  map_y        NUMERIC(8,2) NOT NULL,
  label        VARCHAR(64)
);

CREATE TABLE location_edges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node     UUID NOT NULL REFERENCES location_nodes(id),
  to_node       UUID NOT NULL REFERENCES location_nodes(id),
  distance_m    NUMERIC(8,2) NOT NULL,
  bidirectional BOOLEAN DEFAULT true
);

-- =============================================================================
-- 2. Items & inventory ledger (event-sourced)
-- =============================================================================

CREATE TABLE items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         VARCHAR(64) UNIQUE NOT NULL,
  barcode     VARCHAR(64) UNIQUE NOT NULL,
  name        VARCHAR(256) NOT NULL,
  uom         VARCHAR(16) DEFAULT 'EA',
  weight_kg   NUMERIC(10,3),
  expiry_flag BOOLEAN DEFAULT false,
  velocity    VARCHAR(8) DEFAULT 'medium'
);

CREATE TABLE inventory_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  item_id         UUID NOT NULL REFERENCES items(id),
  from_bin_id     UUID REFERENCES bins(id),
  to_bin_id       UUID REFERENCES bins(id),
  qty             INT NOT NULL CHECK (qty > 0),
  event_type      VARCHAR(32) NOT NULL,
  -- RECEIVE|PUTAWAY|PICK|ADJUST|CYCLE_COUNT|SHORT_PICK|TRANSFER
  ref_type        VARCHAR(32),
  ref_id          UUID,
  worker_id       UUID,
  scan_event_id   UUID,
  idempotency_key VARCHAR(128) UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE VIEW inventory_balance AS
SELECT
  warehouse_id,
  item_id,
  bin_id,
  SUM(qty_delta) AS on_hand_qty
FROM (
  SELECT warehouse_id, item_id, to_bin_id AS bin_id, qty AS qty_delta
  FROM inventory_ledger
  WHERE to_bin_id IS NOT NULL
  UNION ALL
  SELECT warehouse_id, item_id, from_bin_id AS bin_id, -qty AS qty_delta
  FROM inventory_ledger
  WHERE from_bin_id IS NOT NULL
) movements
GROUP BY warehouse_id, item_id, bin_id
HAVING SUM(qty_delta) > 0;

-- =============================================================================
-- 3. Orders & tasks
-- =============================================================================

CREATE TABLE purchase_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number    VARCHAR(32) UNIQUE NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  status       VARCHAR(16) DEFAULT 'open',
  expected_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE po_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id        UUID NOT NULL REFERENCES purchase_orders(id),
  item_id      UUID NOT NULL REFERENCES items(id),
  qty_expected INT NOT NULL,
  qty_received INT DEFAULT 0
);

CREATE TABLE sales_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_number    VARCHAR(32) UNIQUE NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  status       VARCHAR(16) DEFAULT 'open',
  priority     INT DEFAULT 5,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE so_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_id       UUID NOT NULL REFERENCES sales_orders(id),
  item_id     UUID NOT NULL REFERENCES items(id),
  qty_ordered INT NOT NULL,
  qty_picked  INT DEFAULT 0
);

CREATE TABLE putaway_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_line_id   UUID NOT NULL REFERENCES po_lines(id),
  item_id      UUID NOT NULL REFERENCES items(id),
  from_bin_id  UUID,
  to_bin_id    UUID REFERENCES bins(id),
  qty          INT NOT NULL,
  status       VARCHAR(16) DEFAULT 'pending',
  worker_id    UUID,
  completed_at TIMESTAMPTZ
);

CREATE TABLE pick_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number VARCHAR(32) UNIQUE NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  zone_filter  VARCHAR(32),
  status       VARCHAR(16) DEFAULT 'open',
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pick_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     UUID NOT NULL REFERENCES pick_batches(id),
  so_line_id   UUID NOT NULL REFERENCES so_lines(id),
  bin_id       UUID NOT NULL REFERENCES bins(id),
  item_id      UUID NOT NULL REFERENCES items(id),
  qty_required INT NOT NULL,
  qty_picked   INT DEFAULT 0,
  seq          INT NOT NULL,
  status       VARCHAR(16) DEFAULT 'pending',
  worker_id    UUID,
  completed_at TIMESTAMPTZ
);

-- =============================================================================
-- 4. Scan & audit
-- =============================================================================

CREATE TABLE scan_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id    UUID NOT NULL,
  worker_id       UUID NOT NULL,
  barcode_raw     VARCHAR(128) NOT NULL,
  barcode_type    VARCHAR(16),
  workflow        VARCHAR(32),
  session_id      UUID,
  device_type     VARCHAR(16),
  result          VARCHAR(16),
  error_code      VARCHAR(32),
  idempotency_key VARCHAR(128) UNIQUE,
  payload         JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scan_events_worker ON scan_events(worker_id, created_at DESC);
CREATE INDEX idx_ledger_item_bin ON inventory_ledger(item_id, to_bin_id);
CREATE INDEX idx_pick_tasks_batch_seq ON pick_tasks(batch_id, seq);
