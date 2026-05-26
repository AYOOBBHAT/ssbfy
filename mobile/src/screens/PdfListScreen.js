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
import * as WebBrowser from 'expo-web-browser';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import {
  PDF_UPSELL_SUB,
  PDF_UPSELL_TITLE,
  SAVE_ALERT_MESSAGE,
  SAVE_ALERT_TITLE,
} from '../constants/upgradeCopy';
import { PremiumUpsellCard } from '../components/PremiumUpsellCard';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import {
  formatFileSize,
  getCachedPostsSnapshot,
  getPdfNotes,
  getPosts,
  getPdfOpenUserMessage,
  openPdfInAppBrowser,
} from '../services/pdfService';
import logger from '../utils/logger';
import {
  getSavedMaterials,
  getSavedMaterialsSnapshot,
  isSavedMaterialsSnapshotFresh,
  toggleSavedMaterial,
  PREMIUM_SAVE_MESSAGE,
} from '../services/savedMaterialService';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { colors } from '../theme/colors';
import { EMPTY } from '../theme/stateCopy';
import { pressCardStyle, pressFeedbackStyle } from '../utils/pressFeedback';
import { isGlobalOpening } from '../utils/navigationGuard';
import {
  useDevItemMountCounter,
  useDevMountTrace,
  useDevRenderTrace,
} from '../utils/renderPerfDevLog';

const ITEM_SEPARATOR_STYLE = { height: 12 };

function buildSavedPdfIdSet(snapshot) {
  return new Set(
    (snapshot?.savedPdfs || [])
      .map((item) => String(item?.pdfId || '').trim())
      .filter(Boolean)
  );
}

function PdfSeparator() {
  return <View style={ITEM_SEPARATOR_STYLE} />;
}

const PdfRow = memo(function PdfRow({
  item,
  isOpening,
  anyOpening,
  isSaved,
  isSaving,
  onOpen,
  onToggleSave,
}) {
  const pdfId = String(item?._id || '');
  const title = item?.title || item?.fileName || 'Untitled PDF';
  const size = formatFileSize(item?.fileSize);

  useDevRenderTrace(
    'PdfListItem',
    () => ({ pdfId, isOpening, anyOpening, isSaved, isSaving }),
    { logEvery: 20, slowRenderMs: 10, logFirstRender: false }
  );
  useDevItemMountCounter('PdfListItem', pdfId, { logEvery: 20 });

  return (
    <View style={styles.pdfCard}>
      <Pressable
        onPress={() => onOpen(item)}
        disabled={anyOpening}
        style={({ pressed }) => [
          styles.pdfMainArea,
          pressCardStyle(pressed, anyOpening),
          anyOpening && styles.btnDisabled,
        ]}
      >
        <View style={styles.pdfIconWrap}>
          <Text style={styles.pdfIcon}>PDF</Text>
        </View>
        <View style={styles.pdfTextBlock}>
          <Text style={styles.pdfTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.pdfMeta} numberOfLines={1}>
            {size ? `${size} • ` : ''}Tap to open
          </Text>
        </View>
        <Text style={styles.chevron}>{isOpening ? '…' : '›'}</Text>
      </Pressable>
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
    </View>
  );
});

/**
 * Browse study PDFs scoped by Post.
 *
 * Flow:
 *   1. Load posts → let the user pick one (or accept the `postId` passed
 *      via route params, when we came here from an "X Notes" button).
 *   2. Whenever the selected post changes, fetch `/notes/pdfs?postId=…`.
 *   3. Tap a PDF → open `signedUrl` (short-lived) in an in-app browser via
 *      `WebBrowser.openBrowserAsync`. On Android this uses a Chrome
 *      Custom Tab, on iOS an SFSafariViewController — both render PDFs
 *      inline and keep the user inside our app (the browser sheet
 *      slides over, not replaces, the app). This avoids the native
 *      module churn `react-native-pdf` would demand (prebuild + dev
 *      client + loss of Expo Go support).
 */
export default function PdfListScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const initialPostId = route?.params?.postId || null;
  const initialPostsCache = getCachedPostsSnapshot();
  const showPremiumUpsell = !userHasPremiumAccess(user);

  const [posts, setPosts] = useState(() => initialPostsCache?.posts ?? []);
  const [selectedPostId, setSelectedPostId] = useState(initialPostId);

  const [postsLoading, setPostsLoading] = useState(() => !initialPostsCache);
  const [postsError, setPostsError] = useState(null);

  const [pdfs, setPdfs] = useState([]);
  const [pdfsLoading, setPdfsLoading] = useState(false);
  const [pdfsError, setPdfsError] = useState(null);

  const [openingId, setOpeningId] = useState(null);
  const [savedPdfIds, setSavedPdfIds] = useState(() =>
    buildSavedPdfIdSet(getSavedMaterialsSnapshot())
  );
  const [savingId, setSavingId] = useState(null);
  const postsLoadRef = useRef(null);
  const pdfsLoadRef = useRef(null);

  useDevRenderTrace(
    'PdfListScreen',
    () => ({
      pdfs: pdfs.length,
      savedCount: savedPdfIds.size,
      selectedPostId,
      postsLoading,
      pdfsLoading,
      openingId,
      savingId,
    }),
    { logEvery: 6, slowRenderMs: 18 }
  );
  useDevMountTrace(
    'PdfListScreen',
    () => ({
      pdfs: pdfs.length,
      selectedPostId,
      openingId,
    }),
    { slowMountMs: 45 }
  );

  // ---- Posts -------------------------------------------------------------

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
      // Auto-select the first post the first time we see them so the
      // screen isn't empty on mount. Route params win if present.
      setSelectedPostId((prev) => {
        if (prev) return prev;
        return list[0]?._id || null;
      });
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

  // ---- PDFs --------------------------------------------------------------

  const loadPdfs = useCallback(async () => {
    // A post must be picked before we can list. This is guarded by the
    // UI, but we no-op defensively if called without one.
    if (!selectedPostId) {
      pdfsLoadRef.current?.abort();
      pdfsLoadRef.current = null;
      setPdfs([]);
      return;
    }
    if (!userHasPremiumAccess(user)) {
      pdfsLoadRef.current?.abort();
      pdfsLoadRef.current = null;
      setPdfs([]);
      setPdfsError(null);
      return;
    }
    pdfsLoadRef.current?.abort();
    const ac = new AbortController();
    pdfsLoadRef.current = ac;
    setPdfsError(null);
    setPdfsLoading(true);
    try {
      const data = await getPdfNotes(selectedPostId, { signal: ac.signal });
      if (pdfsLoadRef.current !== ac) return;
      setPdfs(Array.isArray(data?.pdfs) ? data.pdfs : []);
    } catch (e) {
      if (isRequestCancelled(e) || pdfsLoadRef.current !== ac) return;
      setPdfsError(getApiErrorMessage(e));
      setPdfs([]);
    } finally {
      if (pdfsLoadRef.current === ac) {
        setPdfsLoading(false);
      }
    }
  }, [selectedPostId, user]);

  useEffect(() => {
    void loadPdfs();
    return () => {
      pdfsLoadRef.current?.abort();
      pdfsLoadRef.current = null;
    };
  }, [loadPdfs]);

  useFocusEffect(
    useCallback(() => {
      const ac = new AbortController();
      const loadSaved = async () => {
        if (!userHasPremiumAccess(user)) {
          setSavedPdfIds(new Set());
          return;
        }
        const cached = getSavedMaterialsSnapshot();
        if (cached) {
          setSavedPdfIds(buildSavedPdfIdSet(cached));
          if (isSavedMaterialsSnapshotFresh()) {
            return;
          }
        }
        try {
          const data = await getSavedMaterials({
            force: true,
            reason: 'pdf_focus',
          });
          if (ac.signal.aborted) return;
          const next = buildSavedPdfIdSet(data);
          setSavedPdfIds(next);
        } catch (e) {
          if (ac.signal.aborted || isRequestCancelled(e)) return;
          if (!cached) {
            setSavedPdfIds(new Set());
          }
        }
      };
      void loadSaved();
      return () => {
        ac.abort();
      };
    }, [user])
  );

  // ---- Actions -----------------------------------------------------------

  /**
   * Open the PDF inside the app using `expo-web-browser`. On Android
   * this materialises as a Chrome Custom Tab, on iOS as an
   * SFSafariViewController — both render Cloudinary-hosted PDFs
   * directly, keep the user "inside" our app, and return control here
   * when the sheet is dismissed.
   *
   * The toolbar colours are wired to our brand so the sheet doesn't
   * look like a foreign window. `presentationStyle: 'pageSheet'` is an
   * iOS-only hint that gives the modal rounded top corners on iOS 13+;
   * it's ignored on Android.
   */
  const handleOpenPdf = useCallback(async (pdf) => {
    if (isGlobalOpening(openingId)) return;
    const id = pdf?._id;
    if (!id) {
      Alert.alert('Cannot open', 'This PDF has no valid link.');
      return;
    }
    const browserOpts = {
      toolbarColor: colors.primary,
      controlsColor: colors.textOnPrimary,
      enableBarCollapsing: true,
      showTitle: true,
      dismissButtonStyle: 'close',
      presentationStyle:
        WebBrowser.WebBrowserPresentationStyle?.PAGE_SHEET ?? 'pageSheet',
    };
    if (__DEV__) {
      logger.debug('PDF open:', { _id: pdf?._id, fileName: pdf?.fileName });
    }
    setOpeningId(id);
    try {
      await openPdfInAppBrowser(pdf, browserOpts, {
        pdfId: String(id || ''),
        onRefreshed: (signedUrl) => {
          setPdfs((prev) =>
            prev.map((p) => (String(p._id) === String(id) ? { ...p, signedUrl } : p))
          );
        },
      });
    } catch (err) {
      Alert.alert('Could not open PDF', getPdfOpenUserMessage(err));
    } finally {
      setOpeningId(null);
    }
  }, [openingId]);

  const handleToggleSave = useCallback(async (pdf) => {
    const pdfId = String(pdf?._id || '').trim();
    if (!pdfId) return;
    if (!userHasPremiumAccess(user)) {
      Alert.alert(SAVE_ALERT_TITLE, SAVE_ALERT_MESSAGE, [
        { text: 'Not now', style: 'cancel' },
        { text: 'See plans', onPress: () => navigation.navigate('Premium', { from: 'saved-materials' }) },
      ]);
      return;
    }
    setSavingId(pdfId);
    try {
      const result = await toggleSavedMaterial({ materialType: 'pdf', pdfId });
      setSavedPdfIds((prev) => {
        const next = new Set(prev);
        if (result?.saved) next.add(pdfId);
        else next.delete(pdfId);
        return next;
      });
    } catch (e) {
      Alert.alert('Could not update saved materials', getApiErrorMessage(e) || PREMIUM_SAVE_MESSAGE);
    } finally {
      setSavingId(null);
    }
  }, [navigation, user]);

  // ---- Render helpers ----------------------------------------------------

  const activePosts = useMemo(
    () => posts.filter((p) => p?.isActive !== false),
    [posts]
  );

  const renderPostChips = useCallback(() => {
    if (postsLoading) {
      return (
        <View style={styles.chipsFallback}>
          <LoadingState compact />
        </View>
      );
    }
    if (postsError) {
      return (
        <View style={styles.chipsFallback}>
          <ErrorState message={postsError} context="posts" onRetry={loadPosts} compact />
        </View>
      );
    }
    if (activePosts.length === 0) {
      return (
        <View style={styles.chipsFallback}>
          <EmptyState compact {...EMPTY.POSTS_NONE} />
        </View>
      );
    }
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {activePosts.map((p) => {
          const active = String(p._id) === String(selectedPostId);
          return (
            <Pressable
              key={p._id}
              onPress={() => setSelectedPostId(p._id)}
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
                {p?.name || p?.slug || 'Untitled'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }, [postsLoading, postsError, loadPosts, activePosts, selectedPostId]);

  const renderPdf = useCallback(
    ({ item }) => {
      const anyOpening = isGlobalOpening(openingId);
      const pdfId = String(item?._id || '');
      return (
        <PdfRow
          item={item}
          isOpening={anyOpening && String(openingId) === String(item?._id)}
          anyOpening={anyOpening}
          isSaved={savedPdfIds.has(pdfId)}
          isSaving={savingId != null && String(savingId) === pdfId}
          onOpen={handleOpenPdf}
          onToggleSave={handleToggleSave}
        />
      );
    },
    [openingId, savedPdfIds, savingId, handleOpenPdf, handleToggleSave]
  );

  const keyExtractor = useCallback((item, idx) => String(item?._id ?? idx), []);

  const listHeader = useMemo(
    () => (
      <>
        {showPremiumUpsell ? (
          <PremiumUpsellCard
            title={PDF_UPSELL_TITLE}
            subtitle={PDF_UPSELL_SUB}
            icon="document-text-outline"
            onPress={() => navigation.navigate('Premium', { from: 'pdf' })}
          />
        ) : null}
        <Text style={styles.sectionTitle}>Post</Text>
        {renderPostChips()}
        <Text style={[styles.sectionTitle, styles.pdfSectionTitle]}>PDF Notes</Text>
      </>
    ),
    [showPremiumUpsell, navigation, renderPostChips]
  );

  const listEmpty = useMemo(() => {
    if (!selectedPostId) {
      return (
        <View style={styles.card}>
          <EmptyState compact {...EMPTY.PDF_PICK_POST} />
        </View>
      );
    }
    if (pdfsLoading) {
      return (
        <View style={styles.card}>
          <LoadingState compact />
        </View>
      );
    }
    if (pdfsError) {
      return (
        <View style={styles.card}>
          <ErrorState message={pdfsError} context="PDFs" onRetry={loadPdfs} compact />
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <EmptyState compact {...EMPTY.PDF_NONE} />
      </View>
    );
  }, [selectedPostId, pdfsLoading, pdfsError, loadPdfs]);

  const visiblePdfs = useMemo(
    () => (selectedPostId && !pdfsLoading && !pdfsError ? pdfs : []),
    [selectedPostId, pdfsLoading, pdfsError, pdfs]
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={visiblePdfs}
      keyExtractor={keyExtractor}
      renderItem={renderPdf}
      ItemSeparatorComponent={PdfSeparator}
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

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pdfSectionTitle: { marginTop: 20 },

  // ---- Post chips ----
  chipsRow: {
    flexDirection: 'row',
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
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

  // ---- PDF list ----
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listContent: { paddingBottom: 4 },
  pdfCard: {
    position: 'relative',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pdfMainArea: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingRight: 44,
  },
  pdfIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pdfIcon: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.6 },
  pdfTextBlock: { flex: 1 },
  pdfTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  pdfMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  chevron: { fontSize: 22, color: colors.muted, marginLeft: 8 },
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

  btnDisabled: { opacity: 0.6 },
});
