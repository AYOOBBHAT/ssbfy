import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import {
  NOTES_UPSELL_SUB,
  NOTES_UPSELL_TITLE,
  SAVE_ALERT_MESSAGE,
  SAVE_ALERT_TITLE,
} from '../constants/upgradeCopy';
import { PremiumUpsellCard } from '../components/PremiumUpsellCard';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import { getCachedPostsSnapshot, getPosts } from '../services/pdfService';
import { getNotes, previewOf } from '../services/noteService';
import { usePracticeTaxonomy } from '../hooks/usePracticeTaxonomy';
import { formatTaxonomyLabel } from '../utils/formatTaxonomyLabel';
import {
  getSavedMaterials,
  getSavedMaterialsSnapshot,
  isSavedMaterialsSnapshotFresh,
  toggleSavedMaterial,
  PREMIUM_SAVE_MESSAGE,
} from '../services/savedMaterialService';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { resolveMongoId } from '../utils/mongoId.js';
import { resolveTopicId } from '../utils/topicRef';
import { colors } from '../theme/colors';
import { EMPTY } from '../theme/stateCopy';
import { pressCardStyle, pressFeedbackStyle } from '../utils/pressFeedback';
import { useNavigationActionLock } from '../hooks/useNavigationActionLock';
import {
  useDevItemMountCounter,
  useDevMountTrace,
  useDevRenderTrace,
} from '../utils/renderPerfDevLog';

const ITEM_SEPARATOR_STYLE = { height: 12 };

function buildSavedNoteIdSet(snapshot) {
  return new Set(
    (snapshot?.savedNotes || [])
      .map((item) => String(item?.noteId || '').trim())
      .filter(Boolean)
  );
}

function NoteSeparator() {
  return <View style={ITEM_SEPARATOR_STYLE} />;
}

const NoteRow = memo(function NoteRow({
  item,
  isSaved,
  isSaving,
  onOpen,
  onToggleSave,
}) {
  const noteId = String(item?._id || '');
  const title = item?.title || 'Untitled note';
  const preview = previewOf(item?.content, 100);

  useDevRenderTrace(
    'NotesListItem',
    () => ({ noteId, isSaved, isSaving }),
    { logEvery: 20, slowRenderMs: 10, logFirstRender: false }
  );
  useDevItemMountCounter('NotesListItem', noteId, { logEvery: 20 });

  return (
    <View style={styles.noteCard}>
      <Pressable
        onPress={() => onToggleSave(item)}
        hitSlop={8}
        disabled={isSaving}
        style={({ pressed }) => [
          styles.saveBtn,
          pressFeedbackStyle(pressed),
          isSaving && styles.btnDisabled,
        ]}
      >
        <Ionicons
          name={isSaved ? 'bookmark' : 'bookmark-outline'}
          size={18}
          color={isSaved ? colors.primary : colors.muted}
        />
      </Pressable>
      <Pressable onPress={() => onOpen(item)} style={({ pressed }) => [pressCardStyle(pressed)]}>
        <Text style={styles.noteTitle} numberOfLines={2}>
          {title}
        </Text>
        {preview ? (
          <Text style={styles.notePreview} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
});

/**
 * Browse structured (text) notes.
 *
 * Navigation contract:
 *   - Can be opened from Home with no params — the screen then drives a
 *     filter picker (Post (optional) → Subject → Topic).
 *   - Can be deep-linked with `{ postId, subjectId, topicId }` route
 *     params to preselect any subset of the hierarchy.
 *
 * Data flow:
 *   1. Load posts on mount (cached in pdfService).
 *   2. Subjects + topics via usePracticeTaxonomy (taxonomyCache SWR).
 *   3. Whenever any filter changes we call `getNotes(filter)` — the
 *      backend does the filtering so this scales to large datasets.
 *
 * Tapping a note pushes `NoteDetail` with the full note object so the
 * detail screen renders immediately without a second network round-trip.
 */
export default function NotesListScreen() {
  const navigation = useNavigation();
  const { runOnce } = useNavigationActionLock();
  const route = useRoute();
  const { user } = useAuth();
  const initial = route?.params || {};
  const initialPostsCache = getCachedPostsSnapshot();
  const showPremiumUpsell = !userHasPremiumAccess(user);

  // ---- Selection state ----
  const [selectedPostId, setSelectedPostId] = useState(
    () => resolveMongoId(initial.postId, 'postId') || ''
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState(
    () => resolveMongoId(initial.subjectId, 'subjectId') || ''
  );
  const [selectedTopicId, setSelectedTopicId] = useState(
    () => resolveTopicId(initial.topicId) || ''
  );

  const { subjects, subjectsLoading, topics, topicsLoading } =
    usePracticeTaxonomy(selectedSubjectId);

  // ---- Reference data (posts) ----
  const [posts, setPosts] = useState(() => initialPostsCache?.posts ?? []);

  const [postsLoading, setPostsLoading] = useState(() => !initialPostsCache);
  const [postsError, setPostsError] = useState(null);

  // ---- Notes list ----
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState(null);
  const [savedNoteIds, setSavedNoteIds] = useState(() =>
    buildSavedNoteIdSet(getSavedMaterialsSnapshot())
  );
  const [savingId, setSavingId] = useState(null);
  const postsLoadRef = useRef(null);
  const notesLoadRef = useRef(null);

  useDevRenderTrace(
    'NotesListScreen',
    () => ({
      notes: notes.length,
      savedCount: savedNoteIds.size,
      selectedPostId,
      selectedSubjectId,
      selectedTopicId,
      notesLoading,
      postsLoading,
      savingId,
    }),
    { logEvery: 6, slowRenderMs: 18 }
  );
  useDevMountTrace(
    'NotesListScreen',
    () => ({
      notes: notes.length,
      selectedPostId,
      selectedSubjectId,
      selectedTopicId,
    }),
    { slowMountMs: 45 }
  );

  // ---- Load posts once -------------------------------------------------
  const loadPosts = useCallback(async () => {
    postsLoadRef.current?.abort();
    const ac = new AbortController();
    postsLoadRef.current = ac;
    const cached = getCachedPostsSnapshot();
    const hasCachedPosts = Array.isArray(cached?.posts);
    setPostsError(null);
    if (!hasCachedPosts) {
      setPostsLoading(true);
    }
    try {
      const data = await getPosts({ signal: ac.signal });
      if (postsLoadRef.current !== ac) return;
      const list = Array.isArray(data?.posts) ? data.posts : [];
      setPosts(list);
    } catch (e) {
      if (isRequestCancelled(e) || postsLoadRef.current !== ac) return;
      setPostsError(getApiErrorMessage(e));
      if (!hasCachedPosts) {
        setPosts([]);
      }
    } finally {
      if (postsLoadRef.current === ac) {
        setPostsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPosts();
    return () => {
      postsLoadRef.current?.abort();
      postsLoadRef.current = null;
    };
  }, [loadPosts]);

  // ---- Clear stale topic when subject catalog changes ----------------
  useEffect(() => {
    if (!selectedTopicId) return;
    if (!topics.some((t) => resolveTopicId(t?._id) === selectedTopicId)) {
      setSelectedTopicId('');
    }
  }, [topics, selectedTopicId]);

  // ---- Load notes whenever any filter changes -------------------------
  const loadNotes = useCallback(async () => {
    notesLoadRef.current?.abort();
    const ac = new AbortController();
    notesLoadRef.current = ac;
    setNotesError(null);
    setNotesLoading(true);
    try {
      const data = await getNotes(
        {
          postId: selectedPostId || undefined,
          subjectId: selectedSubjectId || undefined,
          topicId: selectedTopicId || undefined,
        },
        { signal: ac.signal }
      );
      if (notesLoadRef.current !== ac) return;
      setNotes(Array.isArray(data?.notes) ? data.notes : []);
    } catch (e) {
      if (isRequestCancelled(e) || notesLoadRef.current !== ac) return;
      setNotesError(getApiErrorMessage(e));
      setNotes([]);
    } finally {
      if (notesLoadRef.current === ac) {
        setNotesLoading(false);
      }
    }
  }, [selectedPostId, selectedSubjectId, selectedTopicId]);

  useEffect(() => {
    void loadNotes();
    return () => {
      notesLoadRef.current?.abort();
      notesLoadRef.current = null;
    };
  }, [loadNotes]);

  useFocusEffect(
    useCallback(() => {
      const ac = new AbortController();
      const loadSaved = async () => {
        if (!userHasPremiumAccess(user)) {
          setSavedNoteIds(new Set());
          return;
        }
        const cached = getSavedMaterialsSnapshot();
        if (cached) {
          setSavedNoteIds(buildSavedNoteIdSet(cached));
          if (isSavedMaterialsSnapshotFresh()) {
            return;
          }
        }
        try {
          const data = await getSavedMaterials({
            force: true,
            reason: 'notes_focus',
          });
          if (ac.signal.aborted) return;
          const next = buildSavedNoteIdSet(data);
          setSavedNoteIds(next);
        } catch (e) {
          if (ac.signal.aborted || isRequestCancelled(e)) return;
          if (!cached) {
            setSavedNoteIds(new Set());
          }
        }
      };
      void loadSaved();
      return () => {
        ac.abort();
      };
    }, [user])
  );

  // ---- Handlers -------------------------------------------------------

  const activePosts = useMemo(
    () => posts.filter((p) => p?.isActive !== false),
    [posts]
  );

  const pickPost = useCallback((id) => {
    const sid = String(id);
    setSelectedPostId((prev) => (String(prev) === sid ? '' : sid));
  }, []);

  const pickSubject = useCallback((id) => {
    setSelectedSubjectId((prev) => (prev === id ? '' : id));
    setSelectedTopicId('');
  }, []);

  const pickTopic = useCallback((id) => {
    setSelectedTopicId((prev) => (prev === id ? '' : id));
  }, []);

  const openNote = useCallback((note) => {
    if (!note) return;
    runOnce(() => navigation.navigate('NoteDetail', { note }));
  }, [navigation, runOnce]);

  const handleToggleSave = useCallback(async (note) => {
    const noteId = String(note?._id || '').trim();
    if (!noteId) return;
    if (!userHasPremiumAccess(user)) {
      Alert.alert(SAVE_ALERT_TITLE, SAVE_ALERT_MESSAGE, [
        { text: 'Not now', style: 'cancel' },
        { text: 'See plans', onPress: () => navigation.navigate('Premium', { from: 'saved-materials' }) },
      ]);
      return;
    }
    setSavingId(noteId);
    try {
      const result = await toggleSavedMaterial({ materialType: 'note', noteId });
      setSavedNoteIds((prev) => {
        const next = new Set(prev);
        if (result?.saved) next.add(noteId);
        else next.delete(noteId);
        return next;
      });
    } catch (e) {
      Alert.alert('Could not update saved materials', getApiErrorMessage(e) || PREMIUM_SAVE_MESSAGE);
    } finally {
      setSavingId(null);
    }
  }, [navigation, user]);

  // ---- Render helpers -------------------------------------------------

  const renderChipRow = useCallback(
    ({
      label,
      items,
      selectedId,
      onSelect,
      loading,
      emptyText,
      getItemId,
    }) => {
      const resolveId = getItemId || ((it) => it._id);
      if (loading) {
        return (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{label}</Text>
            <View style={styles.chipsFallback}>
              <LoadingState compact />
            </View>
          </View>
        );
      }
      if (!items || items.length === 0) {
        return (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{label}</Text>
            <View style={styles.chipsFallback}>
              <EmptyState
                compact
                title={emptyText}
                subtitle="Try another filter or check back later."
                glyph="filter"
              />
            </View>
          </View>
        );
      }
      return (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>{label}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {items.map((it) => {
              const itemId = resolveId(it);
              const active = String(itemId) === String(selectedId);
              return (
                <Pressable
                  key={String(itemId)}
                  onPress={() => onSelect(itemId)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressFeedbackStyle(pressed),
                  ]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {formatTaxonomyLabel(it?.name || it?.slug)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      );
    },
    []
  );

  const renderNote = useCallback(
    ({ item }) => {
      const noteId = String(item?._id || '');
      return (
        <NoteRow
          item={item}
          isSaved={savedNoteIds.has(noteId)}
          isSaving={savingId != null && String(savingId) === noteId}
          onOpen={openNote}
          onToggleSave={handleToggleSave}
        />
      );
    },
    [savedNoteIds, savingId, openNote, handleToggleSave]
  );

  const keyExtractor = useCallback((item, idx) => String(item?._id ?? idx), []);

  const renderPostRow = useCallback(() => {
    if (postsLoading) {
      return (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Post</Text>
          <View style={styles.chipsFallback}>
            <LoadingState compact />
          </View>
        </View>
      );
    }
    if (postsError) {
      return (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Post</Text>
          <View style={styles.chipsFallback}>
            <ErrorState message={postsError} context="posts" onRetry={loadPosts} compact />
          </View>
        </View>
      );
    }
    return renderChipRow({
      label: 'Post (optional filter)',
      items: activePosts,
      selectedId: selectedPostId,
      onSelect: pickPost,
      loading: false,
      emptyText: 'No posts available yet',
    });
  }, [postsLoading, postsError, loadPosts, renderChipRow, activePosts, selectedPostId, pickPost]);

  const listHeader = useMemo(
    () => (
      <>
        {showPremiumUpsell ? (
          <PremiumUpsellCard
            title={NOTES_UPSELL_TITLE}
            subtitle={NOTES_UPSELL_SUB}
            icon="bookmark-outline"
            onPress={() => navigation.navigate('Premium', { from: 'notes' })}
          />
        ) : null}
        {renderPostRow()}
        {renderChipRow({
          label: 'Subject',
          items: subjects,
          selectedId: selectedSubjectId,
          onSelect: pickSubject,
          loading: subjectsLoading,
          emptyText: 'No subjects available yet',
        })}
        {selectedSubjectId
          ? renderChipRow({
              label: 'Topic',
              items: topics,
              selectedId: selectedTopicId,
              onSelect: pickTopic,
              getItemId: (it) => resolveTopicId(it?._id) || String(it?._id ?? ''),
              loading: topicsLoading,
              emptyText: 'No topics for this subject yet',
            })
          : null}
        <Text style={[styles.sectionTitle, styles.notesSectionTitle]}>Notes</Text>
      </>
    ),
    [
      showPremiumUpsell,
      navigation,
      renderPostRow,
      renderChipRow,
      subjects,
      selectedSubjectId,
      pickSubject,
      subjectsLoading,
      topics,
      selectedTopicId,
      pickTopic,
      topicsLoading,
    ]
  );

  const listEmpty = useMemo(() => {
    if (notesLoading) {
      return (
        <View style={styles.card}>
          <LoadingState compact />
        </View>
      );
    }
    if (notesError) {
      return (
        <View style={styles.card}>
          <ErrorState message={notesError} context="notes" onRetry={loadNotes} compact />
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <EmptyState
          compact
          {...EMPTY.NOTES_NONE}
          subtitle={
            selectedTopicId
              ? 'Notes for this topic will appear when they are published.'
              : selectedSubjectId
              ? 'Notes for this subject will appear when they are published.'
              : EMPTY.NOTES_NONE.subtitle
          }
        />
      </View>
    );
  }, [notesLoading, notesError, loadNotes, selectedTopicId, selectedSubjectId]);

  const visibleNotes = useMemo(
    () => (notesLoading || notesError ? [] : notes),
    [notesLoading, notesError, notes]
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={visibleNotes}
      keyExtractor={keyExtractor}
      renderItem={renderNote}
      ItemSeparatorComponent={NoteSeparator}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  sectionBlock: { marginBottom: 12 },
  notesSectionTitle: { marginTop: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chips
  chipsRow: { flexDirection: 'row', paddingBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    maxWidth: 220,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.textOnPrimary },
  chipsFallback: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Note list items
  listContent: { paddingBottom: 4 },
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    paddingRight: 42,
  },
  saveBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 2,
  },
  noteTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  notePreview: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 18 },

  btnDisabled: { opacity: 0.6 },
});
