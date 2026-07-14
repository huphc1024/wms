# WMS Warehouse Simulation — UAT Test Cases

Kho demo: `WH-HCM-01`  
Worker: `W-001` | Supervisor: `S-001`

**Severity:** P0 = blocker go-live | P1 = major | P2 = minor

---

## Nhập kho (Receiving / Put-away)

### R-01 — Nhập đủ PO

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | PO-1001 open, 2 dòng SKU; worker đăng nhập, chọn RECEIVING |
| **Steps** | 1. Scan `PO-1001` → 2. Scan `SKU-MILK-1L` → 3. Scan `BIN-A2-08` → 4. Scan `SKU-RICE-5KG` → 5. Scan `BIN-B3-12` → 6. Complete PO |
| **Expected UI** | Progress 2/2; PO status COMPLETED |
| **Expected DB** | 2 `inventory_ledger` events (PUTAWAY); `po_lines.qty_received` = expected |

---

### R-02 — SKU không thuộc PO

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | Session PO-1001 đang mở |
| **Steps** | Scan `SKU-WATER-24` (không có trong PO) |
| **Expected UI** | Lỗi đỏ: "SKU không thuộc PO này" |
| **Expected DB** | Không ghi ledger; `scan_events.result` = error, `error_code` = SKU_NOT_IN_PO |

---

### R-03 — Put-away sai bin

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | Suggest bin `A2-08` sau scan SKU |
| **Steps** | Scan `BIN-A2-09` thay vì `BIN-A2-08` |
| **Expected UI** | Lỗi BIN_MISMATCH; map highlight A2-08 nhấp nháy, A2-09 đỏ |
| **Expected DB** | Không ghi ledger |

---

### R-04 — Put-away đúng bin

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | Suggest bin `A2-08`, qty 50 |
| **Steps** | Scan `BIN-A2-08` |
| **Expected UI** | Toast xanh; chuyển sang SKU tiếp theo hoặc complete line |
| **Expected DB** | Ledger +50; bin status `partial` hoặc `full` |

---

### R-05 — PO nhiều dòng

| | |
|---|---|
| **Severity** | P1 |
| **Preconditions** | PO có 5 dòng SKU |
| **Steps** | Nhập lần lượt 5 SKU + 5 bin |
| **Expected UI** | Progress 5/5 |
| **Expected DB** | 5 ledger events; PO completed |

---

### R-06 — Scan trùng (idempotency)

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | Put-away A2-08 đã confirm |
| **Steps** | Quét lại `BIN-A2-08` cùng idempotency_key |
| **Expected UI** | "Đã quét, bỏ qua" — không tăng qty |
| **Expected DB** | 1 ledger event duy nhất; scan_events duplicate |

---

### R-07 — Offline 3 scan rồi sync

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | Session receiving đang mở |
| **Steps** | 1. Tắt mạng → 2. Scan 3 lần hợp lệ → 3. Bật mạng → 4. Sync |
| **Expected UI** | Badge offline (3); sau sync "Sync xong" |
| **Expected DB** | 3 events accepted; không double-count |

---

### R-08 — Hết capacity bin

| | |
|---|---|
| **Severity** | P1 |
| **Preconditions** | Bin A2-08 còn capacity 10; nhập qty 50 |
| **Steps** | Scan SKU, hệ thống suggest |
| **Expected UI** | Suggest bin khác có đủ capacity (không A2-08) |
| **Expected DB** | Put-away vào bin thay thế |

---

### R-09 — Bin blocked

| | |
|---|---|
| **Severity** | P1 |
| **Preconditions** | Bin `A2-08` status = blocked |
| **Steps** | Scan `BIN-A2-08` khi put-away |
| **Expected UI** | Lỗi BIN_BLOCKED |
| **Expected DB** | Không ghi ledger |

---

### R-10 — Đóng PO chưa xong

| | |
|---|---|
| **Severity** | P1 |
| **Preconditions** | PO-1001 còn 1 dòng chưa nhập |
| **Steps** | Bấm Complete PO |
| **Expected UI** | Chặn hoặc cảnh báo "Còn 1 dòng chưa hoàn tất" |
| **Expected DB** | PO status vẫn receiving/open |

---

## Xuất kho (Picking)

### P-01 — Pick đủ batch 2 task

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | BATCH-9001 (SO-2001), tồn đủ tại A2-08 và B3-12 |
| **Steps** | Hoàn thành task 1 + task 2 |
| **Expected UI** | Batch COMPLETED; chuyển PACKING |
| **Expected DB** | 2 PICK ledger events; `so_lines.qty_picked` = ordered |

---

### P-02 — Walk-path đúng thứ tự

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | Batch có task seq 1 (ZONE-A) và seq 2 (ZONE-B) |
| **Steps** | Gọi `GET /picking/batches/{id}/next` liên tiếp |
| **Expected UI** | Task 1 trước, task 2 sau |
| **Expected DB** | `pick_tasks.seq` sort đúng zone → aisle → bin |

---

### P-03 — Scan bin trước item

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | Task 1 pending tại A2-08 |
| **Steps** | 1. Scan `BIN-A2-08` → 2. Scan `SKU-MILK-1L` → 3. Confirm qty 10 |
| **Expected UI** | State: PENDING → AT_LOCATION → DONE |
| **Expected DB** | Pick task status = done |

---

### P-04 — Scan bin sai

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | Task yêu cầu A2-08 |
| **Steps** | Scan `BIN-A2-09` |
| **Expected UI** | WRONG_LOCATION; map highlight A2-08 |
| **Expected DB** | Task vẫn pending |

---

### P-05 — Scan SKU sai

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | Đã scan đúng bin A2-08 |
| **Steps** | Scan `SKU-RICE-5KG` |
| **Expected UI** | WRONG_ITEM |
| **Expected DB** | Không ghi pick ledger |

---

### P-06 — Short pick

| | |
|---|---|
| **Severity** | P1 |
| **Preconditions** | Task MILK x10, bin chỉ còn 7 |
| **Steps** | Bấm Short pick, nhập 7 |
| **Expected UI** | Exception chờ supervisor; SO partial |
| **Expected DB** | Ledger -7; exception record |

---

### P-07 — Pick hết tồn bin

| | |
|---|---|
| **Severity** | P1 |
| **Preconditions** | Bin A2-08 on_hand = 0 |
| **Steps** | Mở batch cần MILK từ A2-08 |
| **Expected UI** | INSUFFICIENT_STOCK hoặc re-allocate bin khác |
| **Expected DB** | Không pick âm tồn |

---

### P-08 — Zone filter

| | |
|---|---|
| **Severity** | P1 |
| **Preconditions** | Batch có task ZONE-A và ZONE-B; worker chọn ZONE-A |
| **Steps** | Mở guided task |
| **Expected UI** | Chỉ hiện task ZONE-A |
| **Expected DB** | `pick_batches.zone_filter` = ZONE-A |

---

### P-09 — 2 worker cùng batch

| | |
|---|---|
| **Severity** | P1 |
| **Preconditions** | BATCH-9001 open; W-001 và W-002 |
| **Steps** | Cả hai gọi next task đồng thời |
| **Expected UI** | Mỗi worker 1 task khác nhau |
| **Expected DB** | `pick_tasks.worker_id` lock; không duplicate pick |

---

### P-10 — Map highlight đúng bin

| | |
|---|---|
| **Severity** | P0 |
| **Preconditions** | API next trả bin A2-08 |
| **Steps** | Mở Warehouse Twin + worker task screen |
| **Expected UI** | Map zoom A2-08; route polyline hiển thị |
| **Expected DB** | — (UI sync với API) |

---

## Offline sync (bổ sung)

### S-01 — Duplicate idempotency_key khi sync

| | |
|---|---|
| **Severity** | P0 |
| **Steps** | Gửi cùng event 2 lần qua `/sync/scan-events` |
| **Expected** | Lần 2 trong `duplicate[]`; tồn không nhân đôi |

### S-02 — Reject khi bin mismatch sau sync

| | |
|---|---|
| **Severity** | P1 |
| **Steps** | Offline scan sai bin; sync khi online |
| **Expected** | `rejected` + message_vi; event giữ local để sửa |

---

## Checklist trước go-live

- [ ] R-01, R-03, R-06, R-07 pass (P0 nhập)
- [ ] P-01, P-03, P-04, P-10 pass (P0 xuất)
- [ ] S-01 pass (P0 sync)
- [ ] Demo script 3 phút (nhập → xuất → dashboard) chạy được end-to-end
