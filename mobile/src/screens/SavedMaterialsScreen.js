import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { getApiErrorMessage } from '../services/api';
import { getSavedMaterials, toggleSavedMaterial } from '../services/savedMaterialService';
import { resolvePdfUrl } from '../services/pdfService';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { colors } from '../theme/colors';

const TABS = {
  PDF: 'pdf',
  NOTE: 'note',
};

export default function SavedMaterialsScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState(TABS.PDF);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savedPdfs, setSavedPdfs] = useState([]);
  const [savedNotes, setSavedNotes] = useState([]);
  const [workingId, setWorkingId] = useState(null);
  const openSavedPdf = async (item) => {
    const finalUrl = resolvePdfUrl(item?.fileUrl);
    if (!finalUrl) {
      Alert.alert('Cannot open', 'This PDF has no valid link.');
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(finalUrl, {
        toolbarColor: colors.primary,
        controlsColor: colors.textOnPrimary,
        showTitle: true,
        dismissButtonStyle: 'close',
      });
    } catch (e) {
      Alert.alert('Could not open PDF', getApiErrorMessage(e));
    }
  };

  const openSavedNote = (item) => {
    const note = {
      _id: item?.noteId,
      title: item?.title,
      content: item?.content || '',
    };
    navigation.navigate('NoteDetail', { note });
  };


  const loadSaved = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await getSavedMaterials();
      setSavedPdfs(Array.isArray(data?.savedPdfs) ? data.savedPdfs : []);
      setSavedNotes(Array.isArray(data?.savedNotes) ? data.savedNotes : []);
    } catch (e) {
      setError(getApiErrorMessage(e));
      setSavedPdfs([]);
      setSavedNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSaved();
    }, [loadSaved])
  );

  const handleUnsavePdf = async (item) => {
    const pdfId = String(item?.pdfId || '').trim();
    if (!pdfId) return;
    setWorkingId(pdfId);
    try {
      await toggleSavedMaterial({ materialType: 'pdf', pdfId });
      setSavedPdfs((prev) => prev.filter((x) => String(x?.pdfId) !== pdfId));
    } catch (e) {
      Alert.alert('Could not update', getApiErrorMessage(e));
    } finally {
      setWorkingId(null);
    }
  };

  const handleUnsaveNote = async (item) => {
    const noteId = String(item?.noteId || '').trim();
    if (!noteId) return;
    setWorkingId(noteId);
    try {
      await toggleSavedMaterial({ materialType: 'note', noteId });
      setSavedNotes((prev) => prev.filter((x) => String(x?.noteId) !== noteId));
    } catch (e) {
      Alert.alert('Could not update', getApiErrorMessage(e));
    } finally {
      setWorkingId(null);
    }
  };

  const renderPdf = ({ item }) => {
    const id = String(item?.pdfId || '');
    const disabled = workingId != null && String(workingId) === id;
    return (
      <View style={styles.card}>
        <View style={styles.rowTop}>
          <Pressable style={styles.flexOne} onPress={() => openSavedPdf(item)}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item?.title || 'Untitled PDF'}
            </Text>
            {item?.postTitle ? (
              <Text style={styles.meta} numberOfLines={1}>
                {item.postTitle}
              </Text>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => handleUnsavePdf(item)}
            disabled={disabled}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed, disabled && styles.disabled]}
          >
            <Ionicons name="bookmark" size={16} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderNote = ({ item }) => {
    const id = String(item?.noteId || '');
    const disabled = workingId != null && String(workingId) === id;
    return (
      <View style={styles.card}>
        <View style={styles.rowTop}>
          <Pressable style={styles.flexOne} onPress={() => openSavedNote(item)}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item?.title || 'Untitled note'}
            </Text>
            {!!item?.contentPreview ? (
              <Text style={styles.preview} numberOfLines={3}>
                {item.contentPreview}
              </Text>
            ) : null}
            <Text style={styles.meta} numberOfLines={1}>
              {[item?.post, item?.subject, item?.topic].filter(Boolean).join(' • ')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleUnsaveNote(item)}
            disabled={disabled}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed, disabled && styles.disabled]}
          >
            <Ionicons name="bookmark" size={16} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    );
  };

  const currentData = activeTab === TABS.PDF ? savedPdfs : savedNotes;

  return (
    <View style={styles.container}>
      <View style={styles.tabWrap}>
        <Pressable
          onPress={() => setActiveTab(TABS.PDF)}
          style={({ pressed }) => [styles.tab, activeTab === TABS.PDF && styles.tabActive, pressed && styles.pressed]}
        >
          <Text style={[styles.tabText, activeTab === TABS.PDF && styles.tabTextActive]}>Saved PDFs</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab(TABS.NOTE)}
          style={({ pressed }) => [styles.tab, activeTab === TABS.NOTE && styles.tabActive, pressed && styles.pressed]}
        >
          <Text style={[styles.tabText, activeTab === TABS.NOTE && styles.tabTextActive]}>Saved Notes</Text>
        </Pressable>
      </View>

      {loading ? <LoadingState label="Loading saved materials..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={loadSaved} /> : null}
      {!loading && !error && currentData.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title="No saved materials yet"
            subtitle="Save important notes and PDFs here for quick access."
            emoji="🔖"
          />
        </View>
      ) : null}
      {!loading && !error && currentData.length > 0 ? (
        <FlatList
          data={currentData}
          keyExtractor={(item, idx) =>
            String(activeTab === TABS.PDF ? item?.pdfId ?? idx : item?.noteId ?? idx)
          }
          renderItem={activeTab === TABS.PDF ? renderPdf : renderNote}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  tabWrap: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primarySoft },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  tabTextActive: { color: colors.primaryText },
  listContent: { paddingBottom: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flexOne: { flex: 1 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 21 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  preview: { marginTop: 7, fontSize: 13, color: colors.muted, lineHeight: 19 },
  meta: { marginTop: 8, fontSize: 12, color: colors.muted },
  emptyWrap: { marginTop: 28 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
});
