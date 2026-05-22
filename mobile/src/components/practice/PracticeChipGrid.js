import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import PracticeSetupChip from './PracticeSetupChip';
import { formatTaxonomyLabel } from '../../utils/formatTaxonomyLabel';
import logger from '../../utils/logger';

function PracticeChipGrid({
  mode = 'practice',
  items,
  selectedId,
  onSelect,
  getLabel,
  getId,
  children,
}) {
  if (__DEV__ && children != null) {
    logger.warn(
      '[PracticeChipGrid] Deprecated children API — pass items, selectedId, onSelect, getId (see SmartPracticeScreen).'
    );
  }
  if (!items?.length) return null;

  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const id = getId(item);
        const active = String(selectedId) === String(id);
        const label = getLabel ? getLabel(item) : formatTaxonomyLabel(item?.name || item?.slug);
        return (
          <View key={String(id)} style={styles.cell}>
            <PracticeSetupChip
              mode={mode}
              label={label}
              selected={active}
              onPress={() => onSelect(id)}
            />
          </View>
        );
      })}
    </View>
  );
}

export default memo(PracticeChipGrid);

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  cell: {
    width: '50%',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
});
