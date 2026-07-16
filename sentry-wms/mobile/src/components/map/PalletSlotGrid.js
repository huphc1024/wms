import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '../../theme/styles';

const SLOT_COLORS = {
  empty: { fill: '#F0EDE6', border: '#B8AA96', text: colors.textMuted },
  partial: { fill: '#E8F5EA', border: '#2D7A3A', text: '#2D7A3A' },
  full: { fill: '#D4EDDA', border: '#1E5631', text: '#1E5631' },
  highlight: { fill: '#FEF3D7', border: colors.copper, text: colors.copper },
  disabled: { fill: '#EFEFEF', border: '#CCC', text: '#AAA' },
};

function slotStyle(slot, selectMode) {
  if (selectMode && !slot.selectable) {
    return SLOT_COLORS.disabled;
  }
  if (slot.highlight) {
    return SLOT_COLORS.highlight;
  }
  if (slot.is_empty || slot.status === 'empty') {
    return SLOT_COLORS.empty;
  }
  if (slot.status === 'full') {
    return SLOT_COLORS.full;
  }
  return SLOT_COLORS.partial;
}

export default function PalletSlotGrid({ levels = [], onSlotPress, selectMode = null }) {
  return (
    <View style={styles.wrap}>
      {levels.map((levelRow) => (
        <View key={`L${levelRow.level}`} style={styles.levelRow}>
          <View style={styles.levelLabel}>
            <Text style={styles.levelLabelText}>L{levelRow.level}</Text>
          </View>
          <View style={styles.positionsRow}>
            {(levelRow.positions || []).map((slot) => {
              const bin = slot.bin;
              const palette = slotStyle(slot, selectMode);
              const qty = bin?.total_qty || 0;
              const sku = bin?.contents?.[0]?.sku || bin?.pallets?.[0]?.sku;
              return (
                <TouchableOpacity
                  key={`L${levelRow.level}-P${slot.position}`}
                  style={[
                    styles.slot,
                    { backgroundColor: palette.fill, borderColor: palette.border },
                    slot.highlight && styles.slotHighlight,
                  ]}
                  activeOpacity={0.75}
                  disabled={selectMode && !slot.selectable}
                  onPress={() => onSlotPress?.(slot, levelRow.level)}
                >
                  <Text style={[styles.slotCode, { color: palette.text }]}>
                    P{slot.position}
                  </Text>
                  {bin ? (
                    <>
                      <Text style={styles.slotBin} numberOfLines={1}>{bin.bin_code}</Text>
                      {qty > 0 ? (
                        <Text style={styles.slotQty}>{qty} u</Text>
                      ) : (
                        <Text style={styles.slotEmpty}>TRỐNG</Text>
                      )}
                      {sku ? (
                        <Text style={styles.slotSku} numberOfLines={1}>{sku}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.slotEmpty}>—</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  levelRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  levelLabel: {
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  levelLabelText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  positionsRow: { flex: 1, flexDirection: 'row', gap: 8 },
  slot: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1.5,
    borderRadius: radii.card,
    padding: 8,
    justifyContent: 'center',
  },
  slotHighlight: { borderWidth: 2 },
  slotCode: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  slotBin: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  slotQty: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  slotSku: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.copper,
    marginTop: 2,
  },
  slotEmpty: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
  },
});
