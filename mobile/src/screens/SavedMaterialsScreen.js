import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getSavedMaterials, toggleSavedMaterial } from '../services/savedMaterialService';
import { getPdfOpenUserMessage, openPdfInAppBrowser } from '../services/pdfService';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { colors } from '../theme/colors';
import { EMPTY } from '../theme/stateCopy';
import { pressCardStyle, pressFeedbackStyle } from '../utils/pressFeedback';

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
  const loadAbortRef = useRef(null);
  const openSavedPdf = async (item) => {
    const pdfId = String(item?.pdfId || '').trim();
    if (!pdfId) {
      Alert.alert('Cannot open', 'This PDF has no valid link.');
      return;
    }
    try {
      await openPdfInAppBrowser(item, {
        toolbarColor: colors.primary,
        controlsColor: colors.textOnPrimary,
        showTitle: true,
        dismissButtonStyle: 'close',
      }, { pdfId });
    } catch (e) {
      Alert.alert('Could not open PDF', getPdfOpenUserMessage(e));
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
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;
    setError(null);
    setLoading(true);
    try {
      const data = await getSavedMaterials({ signal: ac.signal });
      if (loadAbortRef.current !== ac) return;
      setSavedPdfs(Array.isArray(data?.savedPdfs) ? data.savedPdfs : []);
      setSavedNotes(Array.isArray(data?.savedNotes) ? data.savedNotes : []);
    } catch (e) {
      if (loadAbortRef.current !== ac || isRequestCancelled(e)) return;
      setError(getApiErrorMessage(e));
      setSavedPdfs([]);
      setSavedNotes([]);
    } finally {
      if (loadAbortRef.current === ac) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSaved();
      return () => {
        loadAbortRef.current?.abort();
        loadAbortRef.current = null;
      };
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
          <Pressable
            style={({ pressed }) => [styles.flexOne, pressCardStyle(pressed)]}
            onPress={() => openSavedPdf(item)}
          >
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
            style={({ pressed }) => [styles.iconBtn, pressFeedbackStyle(pressed, disabled), disabled && styles.disabled]}
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
          <Pressable
            style={({ pressed }) => [styles.flexOne, pressCardStyle(pressed)]}
            onPress={() => openSavedNote(item)}
          >
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
            style={({ pressed }) => [styles.iconBtn, pressFeedbackStyle(pressed, disabled), disabled && styles.disabled]}
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
          style={({ pressed }) => [styles.tab, activeTab === TABS.PDF && styles.tabActive, pressFeedbackStyle(pressed)]}
        >
          <Text style={[styles.tabText, activeTab === TABS.PDF && styles.tabTextActive]}>Saved PDFs</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab(TABS.NOTE)}
          style={({ pressed }) => [styles.tab, activeTab === TABS.NOTE && styles.tabActive, pressFeedbackStyle(pressed)]}
        >
          <Text style={[styles.tabText, activeTab === TABS.NOTE && styles.tabTextActive]}>Saved Notes</Text>
        </Pressable>
      </View>

      {loading ? <LoadingState /> : null}
      {!loading && error ? (
        <ErrorState
          message={error}
          context="saved materials"
          onRetry={loadSaved}
          retrying={loading}
        />
      ) : null}
      {!loading && !error && currentData.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState {...EMPTY.SAVED_MATERIALS} />
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
  disabled: { opacity: 0.6 },
});
