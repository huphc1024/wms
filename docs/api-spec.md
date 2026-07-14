# WMS Warehouse Simulation — API Specification

Base URL: `https://api.example.com/v1`

Authentication: `Authorization: Bearer <jwt>`

---

## 1. Master data

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/warehouses` | Danh sách kho |
| GET | `/warehouses/{id}/zones` | Zones + tọa độ map |
| GET | `/warehouses/{id}/bins?zone={code}` | Bins theo zone |
| POST | `/warehouses/{id}/layout/import` | Import CSV layout |
| GET | `/items?barcode={code}` | Tra SKU theo barcode |

### `GET /warehouses/{id}/bins`

**Response:**

```json
{
  "bins": [
    {
      "id": "bin-uuid-1",
      "code": "A2-08",
      "barcode": "BIN-A2-08",
      "zone": "ZONE-A",
      "aisle": "A2",
      "status": "partial",
      "map": { "x": 120, "y": 80, "w": 10, "h": 8 },
      "on_hand": [
        { "sku": "SKU-MILK-1L", "qty": 50 }
      ]
    }
  ]
}
```

---

## 2. Receiving workflow

| Method | Endpoint | Body chính |
|--------|----------|------------|
| POST | `/receiving/sessions` | `{ "po_number": "PO-1001", "worker_id": "W-001" }` |
| POST | `/receiving/sessions/{id}/scan` | `{ "barcode": "SKU-MILK-1L", "qty": 50 }` |
| GET | `/putaway/suggest` | `?item_id=&zone_id=&qty=50` |
| POST | `/putaway/confirm` | `{ "task_id", "bin_barcode", "idempotency_key" }` |
| POST | `/receiving/sessions/{id}/complete` | `{}` |

### `POST /receiving/sessions/{id}/scan` — response

```json
{
  "session_id": "sess-001",
  "po_number": "PO-1001",
  "line": {
    "sku": "SKU-MILK-1L",
    "qty_expected": 50,
    "qty_received": 50,
    "status": "received"
  },
  "putaway_task": {
    "task_id": "pt-001",
    "suggested_bin": {
      "code": "A2-08",
      "barcode": "BIN-A2-08",
      "zone": "ZONE-A",
      "aisle": "A2",
      "instruction_vi": "Mang hàng đến Bin A2-08 và quét mã bin"
    }
  },
  "map_highlight": {
    "from": { "node": "RECEIVING-STAGE", "x": 20, "y": 40 },
    "to": { "bin": "A2-08", "x": 120, "y": 80 },
    "route_polyline": [[20, 40], [60, 40], [60, 80], [120, 80]]
  }
}
```

---

## 3. Picking workflow

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/picking/batches` | Tạo batch từ danh sách SO |
| GET | `/picking/batches/{id}` | Chi tiết batch |
| GET | `/picking/batches/{id}/next` | Task tiếp theo theo walk-path |
| POST | `/picking/tasks/{id}/scan-bin` | Xác nhận đúng vị trí |
| POST | `/picking/tasks/{id}/scan-item` | Xác nhận SKU + qty |
| POST | `/picking/tasks/{id}/short` | Báo thiếu hàng |
| POST | `/picking/batches/{id}/complete` | Đóng batch |

### `GET /picking/batches/{id}/next` — response

```json
{
  "batch_id": "BATCH-9001",
  "progress": { "done": 0, "total": 2 },
  "current_task": {
    "task_id": "pick-001",
    "seq": 1,
    "zone": "ZONE-A",
    "aisle": "A2",
    "bin": "A2-08",
    "bin_barcode": "BIN-A2-08",
    "item_barcode": "SKU-MILK-1L",
    "item_name": "Sữa tươi 1L",
    "qty_required": 10,
    "instruction_vi": "Đi đến Bin A2-08. Quét mã BIN trước, sau đó quét SKU."
  },
  "next_task_preview": {
    "zone": "ZONE-B",
    "bin": "B3-12",
    "item_barcode": "SKU-RICE-5KG"
  },
  "map": {
    "highlight_bin": "A2-08",
    "worker_position": { "x": 20, "y": 40 },
    "route_to_bin": [[20, 40], [60, 40], [120, 80]]
  }
}
```

---

## 4. Realtime (WebSocket)

Channel: `ws://api.example.com/v1/ws?token=...`

**Events server → client:**

```json
{ "type": "SCAN_OK", "worker_id": "W-001", "bin": "A2-08", "timestamp": "..." }
{ "type": "TASK_ASSIGNED", "batch_id": "BATCH-9001", "worker_id": "W-001" }
{ "type": "BIN_STATUS_CHANGED", "bin": "A2-08", "status": "partial" }
{ "type": "BATCH_COMPLETED", "batch_id": "BATCH-9001" }
```

---

## 5. Offline sync

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/sync/scan-events` | Batch upload từ client offline |
| GET | `/sync/status` | Server ack các event đã nhận |

### `POST /sync/scan-events` — request

```json
{
  "events": [
    {
      "client_event_id": "local-001",
      "idempotency_key": "PO-1001|MILK|A2-08|50",
      "barcode": "BIN-A2-08",
      "workflow": "putaway",
      "created_at": "2026-07-08T14:05:12+07:00"
    }
  ]
}
```

### Response

```json
{
  "accepted": ["local-001"],
  "duplicate": [],
  "rejected": [
    {
      "client_event_id": "local-002",
      "error": "BIN_MISMATCH",
      "message_vi": "Sai bin đích"
    }
  ]
}
```

---

## 6. Error codes

| Code | HTTP | Message VI |
|------|------|------------|
| `INVALID_PO` | 404 | Mã PO không tồn tại |
| `SKU_NOT_IN_PO` | 400 | SKU không thuộc PO này |
| `BIN_MISMATCH` | 400 | Sai bin. Cần {expected} |
| `WRONG_LOCATION` | 400 | Bạn chưa đến đúng vị trí |
| `WRONG_ITEM` | 400 | Sai mã hàng |
| `DUPLICATE_SCAN` | 409 | Đã quét, bỏ qua |
| `BIN_BLOCKED` | 400 | Bin đang bị khóa |
| `INSUFFICIENT_STOCK` | 400 | Không đủ tồn tại bin |

---

## 7. State machine (tóm tắt)

### Receiving session

| State | Scan hợp lệ tiếp theo | UI hiển thị |
|-------|----------------------|-------------|
| IDLE | `PO_*` | Quét mã PO để bắt đầu |
| PO_SCANNED | `SKU_*` | Danh sách dòng PO + progress |
| ITEM_SCANNING | `SKU_*` hoặc chuyển put-away | Quét SKU hoặc hoàn tất dòng |
| PUTAWAY_PENDING | `BIN_*` (đúng gợi ý) | Map highlight bin đích |
| COMPLETED | — | Tóm tắt PO |

### Pick task

| State | Scan hợp lệ | Chuyển sang |
|-------|-------------|------------|
| PENDING | `BIN_*` đúng task | AT_LOCATION |
| AT_LOCATION | `SKU_*` đúng task + qty | ITEM_CONFIRMED → DONE |
| PENDING / AT_LOCATION | sai bin/SKU | ERROR |
