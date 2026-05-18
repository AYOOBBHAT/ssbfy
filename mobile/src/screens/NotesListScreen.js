import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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
import { getPosts } from '../services/pdfService';
import {
  getNotes,
  getSubjects,
  getTopicsForSubject,
  previewOf,
} from '../services/noteService';
import {
  getSavedMaterials,
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
 *   2. Load global subjects on mount.
 *   3. When a subject is selected, load its topics.
 *   4. Whenever any filter changes we call `getNotes(filter)` — the
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

  // ---- Reference data ----
  const [posts, setPosts] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);

  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(null);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // ---- Notes list ----
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState(null);
  const [savedNoteIds, setSavedNoteIds] = useState(new Set());
  const [savingId, setSavingId] = useState(null);
  const postsLoadRef = useRef(null);
  const notesLoadRef = useRef(null);
  const subjectsLoadRef = useRef(null);

  // ---- Load posts once -------------------------------------------------
  const loadPosts = useCallback(async () => {
    postsLoadRef.current?.abort();
    const ac = new AbortController();
    postsLoadRef.current = ac;
    setPostsError(null);
    setPostsLoading(true);
    try {
      const data = await getPosts({ force: true, signal: ac.signal });
      if (postsLoadRef.current !== ac) return;
      const list = Array.isArray(data?.posts) ? data.posts : [];
      setPosts(list);
    } catch (e) {
      if (isRequestCancelled(e) || postsLoadRef.current !== ac) return;
      setPostsError(getApiErrorMessage(e));
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

  // ---- Load global subjects once --------------------------------------
  useEffect(() => {
    subjectsLoadRef.current?.abort();
    const ac = new AbortController();
    subjectsLoadRef.current = ac;
    (async () => {
      try {
        setSubjectsLoading(true);
        const data = await getSubjects({ signal: ac.signal });
        if (subjectsLoadRef.current !== ac) return;
        setSubjects(Array.isArray(data?.subjects) ? data.subjects : []);
      } catch (e) {
        if (isRequestCancelled(e) || subjectsLoadRef.current !== ac) return;
        setSubjects([]);
      } finally {
        if (subjectsLoadRef.current === ac) {
          setSubjectsLoading(false);
        }
      }
    })();
    return () => {
      subjectsLoadRef.current?.abort();
      subjectsLoadRef.current = null;
    };
  }, []);

  // ---- Load topics whenever subject changes ---------------------------
  useEffect(() => {
    if (!selectedTopicId) return;
    if (!topics.some((t) => resolveTopicId(t?._id) === selectedTopicId)) {
      setSelectedTopicId('');
    }
  }, [topics, selectedTopicId]);

  useEffect(() => {
    const ac = new AbortController();
    if (!selectedSubjectId) {
      setTopics([]);
      setSelectedTopicId('');
      return undefined;
    }
    (async () => {
      try {
        setTopicsLoading(true);
        const data = await getTopicsForSubject(selectedSubjectId, { signal: ac.signal });
        if (ac.signal.aborted) return;
        setTopics(Array.isArray(data?.topics) ? data.topics : []);
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        setTopics([]);
      } finally {
        if (!ac.signal.aborted) setTopicsLoading(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [selectedSubjectId]);

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
        try {
          const data = await getSavedMaterials({ signal: ac.signal });
          if (ac.signal.aborted) return;
          const next = new Set(
            (data?.savedNotes || [])
              .map((n) => String(n?.noteId || '').trim())
              .filter(Boolean)
          );
          setSavedNoteIds(next);
        } catch (e) {
          if (ac.signal.aborted || isRequestCancelled(e)) return;
          setSavedNoteIds(new Set());
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

  function pickPost(id) {
    const sid = String(id);
    setSelectedPostId((prev) => (String(prev) === sid ? '' : sid));
  }

  function pickSubject(id) {
    setSelectedSubjectId((prev) => (prev === id ? '' : id));
    setSelectedTopicId('');
  }

  function pickTopic(id) {
    setSelectedTopicId((prev) => (prev === id ? '' : id));
  }

  const openNote = (note) => {
    if (!note) return;
    runOnce(() => navigation.navigate('NoteDetail', { note }));
  };

  const handleToggleSave = async (note) => {
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
  };

  // ---- Render helpers -------------------------------------------------

  const renderChipRow = ({ label, items, selectedId, onSelect, loading, emptyText }) => {
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
            const active = String(it._id) === String(selectedId);
            return (
              <Pressable
                key={it._id}
                onPress={() => onSelect(it._id)}
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
                  {it?.name || it?.slug || 'Untitled'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderNote = ({ item }) => {
    const title = item?.title || 'Untitled note';
    const preview = previewOf(item?.content, 100);
    const noteId = String(item?._id || '');
    const isSaved = savedNoteIds.has(noteId);
    const isSaving = savingId != null && String(savingId) === noteId;
    return (
      <View style={styles.noteCard}>
        <Pressable
          onPress={() => handleToggleSave(item)}
          hitSlop={8}
          disabled={isSaving}
          style={({ pressed }) => [styles.saveBtn, pressFeedbackStyle(pressed), isSaving && styles.btnDisabled]}
        >
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={isSaved ? colors.primary : colors.muted}
          />
        </Pressable>
        <Pressable onPress={() => openNote(item)} style={({ pressed }) => [pressCardStyle(pressed)]}>
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
  };

  const renderNotesBody = () => {
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
    if (notes.length === 0) {
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
    }
    return (
      <FlatList
        data={notes}
        keyExtractor={(item, idx) => String(item?._id ?? idx)}
        renderItem={renderNote}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={styles.listContent}
      />
    );
  };

  // ---- Render ---------------------------------------------------------

  // Post row gets its own error/empty fallback since it's loaded via the
  // shared (cached) getPosts helper.
  const renderPostRow = () => {
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
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
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
            loading: topicsLoading,
            emptyText: 'No topics for this subject yet',
          })
        : null}

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Notes</Text>
      {renderNotesBody()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  sectionBlock: { marginBottom: 12 },
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
