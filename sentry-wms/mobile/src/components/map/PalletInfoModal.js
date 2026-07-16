import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import ScanInput from '../ScanInput';
import client from '../../api/client';
import { colors, fonts, radii, buttonStyles } from '../../theme/styles';

export default function PalletInfoModal({
  visible,
  bin,
  pallet,
  warehouseId,
  onClose,
  onSelect,
  selectLabel,
  onInventoryChanged,
}) {
  const [selectedLine, setSelectedLine] = useState(null);
  const [item, setItem] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const pallets = pallet ? [pallet] : (bin?.pallets || []);
  const contents = bin?.contents || [];

  useEffect(() => {
    if (!visible) {
      setSelectedLine(null);
      setItem(null);
      setQuantity('1');
      setMsg('');
      setErr('');
      return;
    }
    if (pallet) {
      pickLine({
        key: pallet.pallet_id,
        item_id: pallet.item_id,
        sku: pallet.sku,
        item_name: pallet.item_name,
        quantity_on_hand: pallet.quantity_on_hand,
        lot_code: pallet.lot_code,
      });
    }
  }, [visible, pallet]);

  if (!bin) return null;

  const pickLine = (line) => {
    setSelectedLine(line);
    setItem(line.item_id ? {
      item_id: line.item_id,
      sku: line.sku,
      item_name: line.item_name,
    } : null);
    setQuantity(String(Math.max(1, Number(line.quantity_on_hand) || 1)));
    setErr('');
    setMsg('');
  };

  const resolveItemFromScan = async (barcode) => {
    setErr('');
    setMsg('');
    try {
      const resp = await client.get(`/api/lookup/item/${encodeURIComponent(barcode)}`);
      const found = resp.data?.item;
      if (!found?.item_id) {
        setErr('Không tìm thấy SKU');
        return;
      }
      setItem(found);
      setSelectedLine((prev) => (prev?.sku === found.sku ? prev : {
        key: `scan-${found.item_id}`,
        item_id: found.item_id,
        sku: found.sku,
        item_name: found.item_name,
        quantity_on_hand: 1,
      }));
      setQuantity((q) => (parseInt(q, 10) > 0 ? q : '1'));
    } catch {
      setErr('Không tìm thấy SKU');
    }
  };

  const submitMove = async (adjustmentType) => {
    if (!warehouseId || !bin?.bin_id) {
      setErr('Thiếu thông tin kho / ô');
      return;
    }
    if (!item?.item_id) {
      setErr('Scan hoặc chọn SKU trước');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr('Số lượng phải > 0');
      return;
    }

    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await client.post('/api/admin/adjustments/direct', {
        warehouse_id: Number(warehouseId),
        bin_id: bin.bin_id,
        item_id: item.item_id,
        adjustment_type: adjustmentType,
        quantity: qty,
        reason: `Mobile map ${adjustmentType === 'ADD' ? 'inbound' : 'outbound'} ${bin.bin_code}`,
      });
      setMsg(adjustmentType === 'ADD'
        ? `Đã nhập ${qty} × ${item.sku}`
        : `Đã xuất ${qty} × ${item.sku}`);
      if (onInventoryChanged) await onInventoryChanged();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Thao tác thất bại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{bin.bin_code}</Text>
          <Text style={styles.sub}>
            {bin.zone_name} · {bin.rack_label || ''} · {bin.slot_label || ''}
          </Text>
          <Text style={styles.meta}>Loại: {bin.bin_type || 'Storage'} · Tồn: {bin.total_qty || 0}</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollInner}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <Text style={styles.sectionTitle}>Hàng trong ô — chạm để chọn xuất</Text>
            {pallets.length > 0 ? (
              pallets.map((p) => {
                const active = selectedLine?.key === p.pallet_id;
                return (
                  <TouchableOpacity
                    key={p.pallet_id}
                    style={[styles.palletCard, active && styles.palletCardActive]}
                    onPress={() => pickLine({
                      key: p.pallet_id,
                      item_id: p.item_id,
                      sku: p.sku,
                      item_name: p.item_name,
                      quantity_on_hand: p.quantity_on_hand,
                      lot_code: p.lot_code,
                    })}
                  >
                    <Text style={styles.palletId}>{p.pallet_id}</Text>
                    <Text style={styles.palletSku}>{p.sku}</Text>
                    <Text style={styles.palletName}>{p.item_name}</Text>
                    <Text style={styles.palletQty}>SL: {p.quantity_on_hand}</Text>
                    {p.lot_code ? <Text style={styles.palletLot}>Lot: {p.lot_code}</Text> : null}
                    {p.expiry_date ? <Text style={styles.palletLot}>HSD: {p.expiry_date}</Text> : null}
                  </TouchableOpacity>
                );
              })
            ) : contents.length > 0 ? (
              contents.map((c, i) => {
                const key = `${c.item_id}-${i}`;
                const active = selectedLine?.key === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.palletCard, active && styles.palletCardActive]}
                    onPress={() => pickLine({
                      key,
                      item_id: c.item_id,
                      sku: c.sku,
                      item_name: c.item_name,
                      quantity_on_hand: c.quantity_on_hand,
                      lot_code: c.lot_number,
                    })}
                  >
                    <Text style={styles.palletSku}>{c.sku}</Text>
                    <Text style={styles.palletName}>{c.item_name}</Text>
                    <Text style={styles.palletQty}>SL: {c.quantity_on_hand}</Text>
                    {c.lot_number ? <Text style={styles.palletLot}>Lot: {c.lot_number}</Text> : null}
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={styles.empty}>Ô trống — scan SKU để nhập hàng</Text>
            )}

            {!onSelect ? (
              <View style={styles.moveBox}>
                <Text style={styles.sectionTitle}>Scan / chọn SKU</Text>
                <ScanInput
                  placeholder="SCAN SKU / UPC"
                  onScan={resolveItemFromScan}
                  autoFocus={false}
                />
                {item ? (
                  <Text style={styles.selectedSku}>
                    Đang chọn: <Text style={styles.selectedSkuBold}>{item.sku}</Text>
                    {item.item_name ? ` — ${item.item_name}` : ''}
                  </Text>
                ) : null}
                <View style={styles.qtyRow}>
                  <Text style={styles.qtyLabel}>Số lượng</Text>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="number-pad"
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="1"
                    placeholderTextColor={colors.textPlaceholder}
                  />
                </View>
                {!!err && <Text style={styles.err}>{err}</Text>}
                {!!msg && <Text style={styles.ok}>{msg}</Text>}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            {onSelect ? (
              <TouchableOpacity style={[buttonStyles.buttonPrimary, styles.btn]} onPress={onSelect}>
                <Text style={buttonStyles.buttonPrimaryText}>{selectLabel || 'CHỌN VỊ TRÍ'}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[buttonStyles.buttonPrimary, styles.btn]}
                  disabled={busy}
                  onPress={() => submitMove('ADD')}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.cream} />
                  ) : (
                    <Text style={buttonStyles.buttonPrimaryText}>NHẬP HÀNG</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[buttonStyles.buttonSecondary, styles.btn]}
                  disabled={busy}
                  onPress={() => submitMove('REMOVE')}
                >
                  <Text style={buttonStyles.buttonSecondaryText}>XUẤT HÀNG</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={[buttonStyles.buttonSecondary, styles.btn, onSelect ? null : styles.closeBtn]}
              onPress={onClose}
            >
              <Text style={buttonStyles.buttonSecondaryText}>ĐÓNG</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    maxHeight: '90%',
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 10,
  },
  scroll: {
    flexGrow: 0,
    maxHeight: 420,
  },
  scrollInner: {
    paddingBottom: 8,
  },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  palletCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
    marginBottom: 8,
  },
  palletCardActive: {
    borderColor: colors.accentRed,
    backgroundColor: '#F8EEEA',
  },
  palletId: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 2,
  },
  palletSku: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentRed,
  },
  palletName: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textPrimary,
    marginTop: 2,
  },
  palletQty: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
  },
  palletLot: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  empty: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  moveBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  selectedSku: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  selectedSkuBold: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  qtyLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textSecondary,
  },
  qtyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.textPrimary,
  },
  err: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.danger,
    marginBottom: 6,
  },
  ok: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.success,
    marginBottom: 6,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  btn: {
    flexGrow: 1,
    minWidth: '30%',
    marginTop: 0,
  },
  closeBtn: {
    minWidth: '100%',
  },
});
