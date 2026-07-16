import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import client from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import ErrorPopup from '../components/ErrorPopup';
import useScreenError from '../hooks/useScreenError';
import PalletSlotGrid from '../components/map/PalletSlotGrid';
import PalletInfoModal from '../components/map/PalletInfoModal';
import { colors, fonts, screenStyles } from '../theme/styles';

export default function RackMapScreen({ navigation, route }) {
  const { warehouseId } = useAuth();
  const {
    rackKey,
    rackLabel,
    zoneCode,
    selectMode,
    itemId,
    sku,
    returnScreen,
  } = route.params || {};

  const { error, showError, clearError } = useScreenError();
  const [rack, setRack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!warehouseId || !rackKey) return null;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ warehouse_id: String(warehouseId) });
      if (selectMode) params.set('mode', selectMode);
      if (itemId) params.set('item_id', String(itemId));
      if (sku) params.set('sku', sku);
      const encodedKey = encodeURIComponent(rackKey);
      const resp = await client.get(`/api/warehouse-map/rack/${encodedKey}?${params.toString()}`);
      const nextRack = resp.data?.rack || null;
      setRack(nextRack);
      return nextRack;
    } catch (err) {
      showError(err.response?.data?.error || 'Không tải được dãy kệ');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [warehouseId, rackKey, selectMode, itemId, sku, showError]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSlotPress = (slot) => {
    if (!slot?.bin) return;
    setSelectedSlot(slot);
    setModalVisible(true);
  };

  const refreshAfterMove = async () => {
    const binId = selectedSlot?.bin?.bin_id;
    const nextRack = await load({ silent: true });
    if (!binId || !nextRack?.levels) return;
    for (const level of nextRack.levels) {
      for (const slot of level.slots || []) {
        if (slot?.bin?.bin_id === binId) {
          setSelectedSlot(slot);
          return;
        }
      }
    }
  };

  const confirmSelection = () => {
    const bin = selectedSlot?.bin;
    if (!bin) return;
    setModalVisible(false);

    if (selectMode && returnScreen) {
      navigation.navigate({
        name: returnScreen,
        params: {
          mapSelectedBin: {
            bin_id: bin.bin_id,
            bin_code: bin.bin_code,
            zone_name: bin.zone_name,
          },
        },
        merge: true,
      });
      navigation.pop(3);
      return;
    }

    setSelectedSlot(null);
  };

  const selectLabel = selectMode === 'putaway'
    ? 'CẤT VÀO Ô NÀY'
    : selectMode === 'pick'
      ? 'LẤY TỪ Ô NÀY'
      : null;

  return (
    <View style={screenStyles.screen}>
      <ScreenHeader
        title={rackLabel || 'DÃY KỆ'}
        onBack={() => navigation.goBack()}
      />
      <ScrollView style={screenStyles.content} contentContainerStyle={screenStyles.contentInner}>
        <Text style={styles.meta}>
          {zoneCode} · {rack?.occupied_slots ?? 0}/{rack?.total_slots ?? 0} ô có hàng
        </Text>
        {selectMode ? (
          <Text style={styles.hint}>
            {selectMode === 'putaway'
              ? 'Ô xám = không chọn được. Chọn ô trống.'
              : 'Ô vàng = có hàng khớp SKU. Chọn để lấy hàng.'}
          </Text>
        ) : (
          <Text style={styles.hint}>Chạm ô pallet → chọn/scan SKU → Nhập hàng / Xuất hàng</Text>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={colors.accentRed} style={{ marginTop: 32 }} />
        ) : (
          <PalletSlotGrid
            levels={rack?.levels || []}
            selectMode={selectMode}
            onSlotPress={handleSlotPress}
          />
        )}
      </ScrollView>

      <PalletInfoModal
        visible={modalVisible}
        bin={selectedSlot?.bin}
        warehouseId={warehouseId}
        onClose={() => {
          setModalVisible(false);
          setSelectedSlot(null);
        }}
        onSelect={
          selectMode && selectedSlot?.selectable
            ? confirmSelection
            : null
        }
        selectLabel={selectLabel}
        onInventoryChanged={refreshAfterMove}
      />

      <ErrorPopup visible={!!error} message={error} onDismiss={clearError} />
    </View>
  );
}

const styles = StyleSheet.create({
  meta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  hint: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 14,
    lineHeight: 16,
  },
});
