import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
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
  PREMIUM_SAVE_MESSAGE,
} from '../constants/upgradeCopy';
import { PremiumUpsellCard } from '../components/PremiumUpsellCard';
import { PremiumPdfCard } from '../components/PremiumPdfCard';
import { PremiumPdfUpgradeModal } from '../components/PremiumPdfUpgradeModal';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import {
  getCachedPostsSnapshot,
  getPdfNotes,
  getPosts,
  getPdfOpenUserMessage,
  isPdfLocked,
  openPdfInAppBrowser,
} from '../services/pdfService';
import { trackPremiumPdfEvent } from '../services/premiumPdfAnalytics';
import logger from '../utils/logger';
import {
  getSavedMaterials,
  getSavedMaterialsSnapshot,
  isSavedMaterialsSnapshotFresh,
  toggleSavedMaterial,
} from '../services/savedMaterialService';
import { showBeforePdf } from '../services/ads/interstitialOrchestrator';
import {
  isGlobalOpening,
  tryAcquireLock,
  releaseLockAfter,
  PDF_OPEN_LOCK_MS,
} from '../utils/navigationGuard';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { colors } from '../theme/colors';
import { EMPTY } from '../theme/stateCopy';
import { pressCardStyle, pressFeedbackStyle } from '../utils/pressFeedback';
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

const UnlockedPdfRow = memo(function UnlockedPdfRow({
  item,
  isOpening,
  anyOpening,
  isSaved,
  isSaving,
  onOpen,
  onToggleSave,
}) {
  const pdfId = String(item?._id || item?.pdfId || '');
  useDevRenderTrace(
    'UnlockedPdfRow',
    () => ({ pdfId, isOpening, anyOpening, isSaved, isSaving }),
    { logEvery: 20, slowRenderMs: 10, logFirstRender: false }
  );
  useDevItemMountCounter('UnlockedPdfRow', pdfId, { logEvery: 20 });

  return (
    <View style={styles.unlockedWrap}>
      <PremiumPdfCard
        title={item?.title || item?.fileName || 'Untitled PDF'}
        subtitle={item?.postTitle || ''}
        pages={item?.pages}
        fileSize={item?.fileSize}
        createdAt={item?.createdAt}
        locked={false}
        isOpening={isOpening}
        onPress={() => onOpen(item)}
      />
      <Pressable
        onPress={() => onToggleSave(item)}
        hitSlop={8}
        disabled={isSaving || anyOpening}
        style={({ pressed }) => [
          styles.saveBtn,
          pressFeedbackStyle(pressed),
          isSaving && styles.btnDisabled,
        ]}
        accessibilityLabel={isSaved ? 'Remove bookmark' : 'Save PDF'}
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
 * Free users see locked discovery cards; premium users open signed URLs.
 */
export default function PdfListScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const initialPostId = route?.params?.postId || null;
  const initialPostsCache = getCachedPostsSnapshot();
  const isPremium = userHasPremiumAccess(user);
  const showPremiumUpsell = !isPremium;

  const [posts, setPosts] = useState(() => initialPostsCache?.posts ?? []);
  const [selectedPostId, setSelectedPostId] = useState(initialPostId);

  const [postsLoading, setPostsLoading] = useState(() => !initialPostsCache);
  const [postsError, setPostsError] = useState(null);

  const [pdfs, setPdfs] = useState([]);
  const [pdfsLoading, setPdfsLoading] = useState(false);
  const [pdfsError, setPdfsError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [openingId, setOpeningId] = useState(null);
  const [savedPdfIds, setSavedPdfIds] = useState(() =>
    buildSavedPdfIdSet(getSavedMaterialsSnapshot())
  );
  const [savingId, setSavingId] = useState(null);
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [upgradeSource, setUpgradeSource] = useState('card');

  const postsLoadRef = useRef(null);
  const pdfsLoadRef = useRef(null);
  const pdfOpenLockRef = useRef(false);
  const searchTrackTimer = useRef(null);

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
      isPremium,
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

  const openUpgrade = useCallback((source = 'card') => {
    setUpgradeSource(source);
    setUpgradeVisible(true);
    trackPremiumPdfEvent('premium_pdf_dialog_opened', { source });
  }, []);

  const closeUpgrade = useCallback(() => {
    setUpgradeVisible(false);
    trackPremiumPdfEvent('premium_pdf_dialog_closed', { source: upgradeSource });
  }, [upgradeSource]);

  const goUpgrade = useCallback(() => {
    trackPremiumPdfEvent('premium_pdf_upgrade_clicked', { source: upgradeSource });
    setUpgradeVisible(false);
    navigation.navigate('Premium', { from: 'pdf' });
  }, [navigation, upgradeSource]);

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
    if (!selectedPostId) {
      pdfsLoadRef.current?.abort();
      pdfsLoadRef.current = null;
      setPdfs([]);
      return;
    }
    pdfsLoadRef.current?.abort();
    const ac = new AbortController();
    pdfsLoadRef.current = ac;
    setPdfsError(null);
    setPdfsLoading(true);
    try {
      const data = await getPdfNotes(selectedPostId, {
        signal: ac.signal,
        cacheTier: userHasPremiumAccess(user) ? 'premium' : 'discovery',
      });
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
          setSavedPdfIds(buildSavedPdfIdSet(data));
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

  const handleOpenPdf = useCallback(
    async (pdf) => {
      if (isPdfLocked(pdf) || !userHasPremiumAccess(user)) {
        trackPremiumPdfEvent('premium_pdf_locked_open_attempt', {
          hasId: !!(pdf?._id || pdf?.pdfId),
        });
        trackPremiumPdfEvent('premium_pdf_card_clicked', { locked: true });
        openUpgrade('locked_open');
        return;
      }
      if (isGlobalOpening(openingId) || !tryAcquireLock(pdfOpenLockRef)) return;
      const id = pdf?._id || pdf?.pdfId;
      if (!id) {
        releaseLockAfter(pdfOpenLockRef, 0);
        Alert.alert('Cannot open', 'This PDF has no valid link.');
        return;
      }
      trackPremiumPdfEvent('premium_pdf_card_clicked', { locked: false });
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
        logger.debug('PDF open:', { _id: id, fileName: pdf?.fileName });
      }
      setOpeningId(id);
      try {
        try {
          await showBeforePdf({ user });
        } catch (_) {
          /* ads must never block PDF open */
        }
        await openPdfInAppBrowser(pdf, browserOpts, {
          pdfId: String(id || ''),
          onRefreshed: (signedUrl) => {
            setPdfs((prev) =>
              prev.map((p) =>
                String(p._id || p.pdfId) === String(id) ? { ...p, signedUrl, locked: false } : p
              )
            );
          },
        });
      } catch (err) {
        Alert.alert('Could not open PDF', getPdfOpenUserMessage(err));
      } finally {
        setOpeningId(null);
        releaseLockAfter(pdfOpenLockRef, PDF_OPEN_LOCK_MS);
      }
    },
    [openingId, user, openUpgrade]
  );

  const handleToggleSave = useCallback(
    async (pdf) => {
      const pdfId = String(pdf?._id || pdf?.pdfId || '').trim();
      if (!pdfId) return;
      if (!userHasPremiumAccess(user) || isPdfLocked(pdf)) {
        openUpgrade('save');
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
        Alert.alert(
          'Could not update saved materials',
          getApiErrorMessage(e) || PREMIUM_SAVE_MESSAGE
        );
      } finally {
        setSavingId(null);
      }
    },
    [user, openUpgrade]
  );

  const onChangeSearch = useCallback((text) => {
    setSearchQuery(text);
    if (searchTrackTimer.current) clearTimeout(searchTrackTimer.current);
    searchTrackTimer.current = setTimeout(() => {
      const q = String(text || '').trim();
      if (q.length >= 2) {
        trackPremiumPdfEvent('premium_pdf_search', { qLen: q.length });
      }
    }, 450);
  }, []);

  useEffect(
    () => () => {
      if (searchTrackTimer.current) clearTimeout(searchTrackTimer.current);
    },
    []
  );

  // ---- Render helpers ----------------------------------------------------

  const activePosts = useMemo(
    () => posts.filter((p) => p?.isActive !== false),
    [posts]
  );

  const filteredPdfs = useMemo(() => {
    const q = String(searchQuery || '')
      .trim()
      .toLowerCase();
    if (!q) return pdfs;
    return pdfs.filter((p) => {
      const hay = [p?.title, p?.fileName, p?.postTitle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pdfs, searchQuery]);

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
      const pdfId = String(item?._id || item?.pdfId || '');
      const locked = isPdfLocked(item) || !isPremium;

      if (locked) {
        return (
          <PremiumPdfCard
            title={item?.title || item?.fileName || 'Untitled PDF'}
            subtitle={item?.postTitle || ''}
            pages={item?.pages}
            fileSize={item?.fileSize}
            createdAt={item?.createdAt}
            locked
            onUnlockPress={() => {
              trackPremiumPdfEvent('premium_pdf_card_clicked', { locked: true });
              openUpgrade('card');
            }}
          />
        );
      }

      return (
        <UnlockedPdfRow
          item={item}
          isOpening={anyOpening && String(openingId) === pdfId}
          anyOpening={anyOpening}
          isSaved={savedPdfIds.has(pdfId)}
          isSaving={savingId != null && String(savingId) === pdfId}
          onOpen={handleOpenPdf}
          onToggleSave={handleToggleSave}
        />
      );
    },
    [
      openingId,
      savedPdfIds,
      savingId,
      handleOpenPdf,
      handleToggleSave,
      isPremium,
      openUpgrade,
    ]
  );

  const keyExtractor = useCallback(
    (item, idx) => String(item?._id ?? item?.pdfId ?? idx),
    []
  );

  const statsLabel = useMemo(() => {
    const n = filteredPdfs.length;
    if (!selectedPostId || pdfsLoading || pdfsError) return null;
    if (isPremium) {
      return n === 1 ? '1 Note Available' : `${n} Notes Available`;
    }
    return n === 1 ? '1 Premium Note Available' : `${n} Premium Notes Available`;
  }, [filteredPdfs.length, selectedPostId, pdfsLoading, pdfsError, isPremium]);

  const listHeader = useMemo(
    () => (
      <>
        {showPremiumUpsell ? (
          <PremiumUpsellCard
            title={PDF_UPSELL_TITLE}
            subtitle={PDF_UPSELL_SUB}
            icon="document-text-outline"
            onPress={() => {
              trackPremiumPdfEvent('premium_pdf_upgrade_clicked', { source: 'upsell' });
              openUpgrade('upsell');
            }}
          />
        ) : null}

        <View style={styles.statsBlock}>
          <Text style={styles.statsTitle}>PDF Notes</Text>
          {statsLabel ? <Text style={styles.statsCount}>{statsLabel}</Text> : null}
          {showPremiumUpsell ? (
            <Text style={styles.statsLibrary}>Premium Library</Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Post</Text>
        {renderPostChips()}

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={onChangeSearch}
            placeholder="Search PDFs"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {searchQuery ? (
            <Pressable
              onPress={() => onChangeSearch('')}
              hitSlop={8}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.sectionTitle, styles.pdfSectionTitle]}>Results</Text>
      </>
    ),
    [
      showPremiumUpsell,
      statsLabel,
      renderPostChips,
      searchQuery,
      onChangeSearch,
      openUpgrade,
    ]
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
    if (searchQuery.trim() && pdfs.length > 0) {
      return (
        <View style={styles.card}>
          <EmptyState
            compact
            title="No matching PDFs"
            subtitle="Try another search term or post filter."
            glyph="filter"
          />
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <EmptyState compact {...EMPTY.PDF_NONE} />
      </View>
    );
  }, [selectedPostId, pdfsLoading, pdfsError, loadPdfs, searchQuery, pdfs.length]);

  const visiblePdfs = useMemo(
    () => (selectedPostId && !pdfsLoading && !pdfsError ? filteredPdfs : []),
    [selectedPostId, pdfsLoading, pdfsError, filteredPdfs]
  );

  return (
    <>
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
      <PremiumPdfUpgradeModal
        visible={upgradeVisible}
        onClose={closeUpgrade}
        onUpgrade={goUpgrade}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  statsBlock: {
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  statsCount: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryText,
  },
  statsLibrary: {
    marginTop: 2,
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pdfSectionTitle: { marginTop: 16 },

  searchWrap: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 6,
  },

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

  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unlockedWrap: {
    position: 'relative',
  },
  saveBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 2,
  },
  btnDisabled: { opacity: 0.6 },
});
