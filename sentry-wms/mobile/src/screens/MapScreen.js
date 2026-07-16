import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import client from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import ErrorPopup from '../components/ErrorPopup';
import useScreenError from '../hooks/useScreenError';
import { colors, fonts, radii, screenStyles } from '../theme/styles';

export default function MapScreen({ navigation, route }) {
  const { warehouseId } = useAuth();
  const { error, showError, clearError } = useScreenError();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  const selectMode = route.params?.selectMode || null;
  const itemId = route.params?.itemId;
  const sku = route.params?.sku;
  const returnScreen = route.params?.returnScreen || 'PutAway';

  const load = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    try {
      const resp = await client.get(`/api/warehouse-map?warehouse_id=${warehouseId}`);
      setZones(resp.data?.zones || []);
    } catch (err) {
      showError(err.response?.data?.error || 'Không tải được sơ đồ kho');
    } finally {
      setLoading(false);
    }
  }, [warehouseId, showError]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const title = selectMode === 'putaway'
    ? 'CHỌN KHU CẤT'
    : selectMode === 'pick'
      ? 'CHỌN KHU LẤY'
      : 'SƠ ĐỒ KHO';

  return (
    <View style={screenStyles.screen}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />
      <ScrollView style={screenStyles.content} contentContainerStyle={screenStyles.contentInner}>
        {selectMode ? (
          <Text style={styles.hint}>
            {selectMode === 'putaway'
              ? 'Chọn khu → dãy kệ → ô pallet trống để cất hàng'
              : 'Chọn khu → dãy kệ → ô có hàng cần lấy'}
          </Text>
        ) : (
          <Text style={styles.hint}>Chọn khu để xem dãy kệ và từng tầng pallet</Text>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={colors.accentRed} style={{ marginTop: 32 }} />
        ) : (
          zones.map((zone) => (
            <TouchableOpacity
              key={zone.zone_id}
              style={[styles.zoneCard, { borderLeftColor: zone.color || colors.copper }]}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('ZoneMap', {
                zoneId: zone.zone_id,
                zoneCode: zone.zone_code,
                zoneName: zone.zone_name,
                selectMode,
                itemId,
                sku,
                returnScreen,
              })}
            >
              <View style={styles.zoneTop}>
                <Text style={styles.zoneCode}>{zone.zone_code}</Text>
                <Text style={styles.zoneFill}>{zone.fill_pct ?? 0}%</Text>
              </View>
              <Text style={styles.zoneName}>{zone.zone_name}</Text>
              <Text style={styles.zoneMeta}>
                {zone.rack_count ?? 0} dãy · {zone.occupied_bins}/{zone.bin_count} ô có hàng
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${zone.fill_pct ?? 0}%`, backgroundColor: zone.color || colors.copper }]} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
      <ErrorPopup visible={!!error} message={error} onDismiss={clearError} />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 12,
    lineHeight: 16,
  },
  zoneCard: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderLeftWidth: 5,
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 10,
  },
  zoneTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  zoneCode: {
    fontFamily: fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  zoneFill: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentRed,
  },
  zoneName: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  zoneMeta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 6,
  },
  barTrack: {
    height: 4,
    backgroundColor: colors.cardBorder,
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 2 },
});
