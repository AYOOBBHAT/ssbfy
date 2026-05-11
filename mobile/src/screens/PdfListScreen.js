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
import * as WebBrowser from 'expo-web-browser';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import {
  formatFileSize,
  getPdfNotes,
  getPosts,
  getPdfOpenUserMessage,
  openPdfInAppBrowser,
} from '../services/pdfService';
import logger from '../utils/logger';
import {
  getSavedMaterials,
  toggleSavedMaterial,
  PREMIUM_SAVE_MESSAGE,
} from '../services/savedMaterialService';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { colors } from '../theme/colors';

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
  const showPremiumUpsell = !userHasPremiumAccess(user);

  const [posts, setPosts] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState(initialPostId);

  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(null);

  const [pdfs, setPdfs] = useState([]);
  const [pdfsLoading, setPdfsLoading] = useState(false);
  const [pdfsError, setPdfsError] = useState(null);

  const [openingId, setOpeningId] = useState(null);
  const [savedPdfIds, setSavedPdfIds] = useState(new Set());
  const [savingId, setSavingId] = useState(null);
  const postsLoadRef = useRef(null);
  const pdfsLoadRef = useRef(null);

  // ---- Posts -------------------------------------------------------------

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
      // Auto-select the first post the first time we see them so the
      // screen isn't empty on mount. Route params win if present.
      setSelectedPostId((prev) => {
        if (prev) return prev;
        return list[0]?._id || null;
      });
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
        try {
          const data = await getSavedMaterials({ signal: ac.signal });
          if (ac.signal.aborted) return;
          const next = new Set(
            (data?.savedPdfs || [])
              .map((p) => String(p?.pdfId || '').trim())
              .filter(Boolean)
          );
          setSavedPdfIds(next);
        } catch (e) {
          if (ac.signal.aborted || isRequestCancelled(e)) return;
          setSavedPdfIds(new Set());
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
  const handleOpenPdf = async (pdf) => {
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
  };

  const handleToggleSave = async (pdf) => {
    const pdfId = String(pdf?._id || '').trim();
    if (!pdfId) return;
    if (!userHasPremiumAccess(user)) {
      Alert.alert('Premium feature', 'Upgrade to save materials for later.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => navigation.navigate('Premium', { from: 'saved-materials' }) },
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
  };

  // ---- Render helpers ----------------------------------------------------

  const activePosts = useMemo(
    () => posts.filter((p) => p?.isActive !== false),
    [posts]
  );

  const renderPostChips = () => {
    if (postsLoading) {
      return (
        <View style={styles.chipsFallback}>
          <LoadingState label="Loading posts..." compact />
        </View>
      );
    }
    if (postsError) {
      return (
        <View style={styles.chipsFallback}>
          <ErrorState message={postsError} onRetry={loadPosts} compact />
        </View>
      );
    }
    if (activePosts.length === 0) {
      return (
        <View style={styles.chipsFallback}>
          <EmptyState
            title="No posts yet"
            subtitle="Posts (exams) appear here once an admin creates them."
            emoji="📚"
            compact
          />
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
                pressed && styles.btnPressed,
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
  };

  const renderPdfBody = () => {
    if (!selectedPostId) {
      return (
        <View style={styles.card}>
          <EmptyState
            title="Pick a post"
            subtitle="Select a post above to see its PDF notes."
            emoji="👆"
            compact
          />
        </View>
      );
    }
    if (pdfsLoading) {
      return (
        <View style={styles.card}>
          <LoadingState label="Loading PDFs..." compact />
        </View>
      );
    }
    if (pdfsError) {
      return (
        <View style={styles.card}>
          <ErrorState message={pdfsError} onRetry={loadPdfs} compact />
        </View>
      );
    }
    if (pdfs.length === 0) {
      return (
        <View style={styles.card}>
          <EmptyState
            title="No PDFs yet"
            subtitle="Check back soon — new study material is added regularly."
            emoji="📄"
            compact
          />
        </View>
      );
    }
    return (
      <FlatList
        data={pdfs}
        keyExtractor={(item, idx) => String(item?._id ?? idx)}
        renderItem={renderPdf}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    );
  };

  const renderPdf = ({ item }) => {
    const title = item?.title || item?.fileName || 'Untitled PDF';
    const size = formatFileSize(item?.fileSize);
    const isOpening = openingId != null && String(openingId) === String(item?._id);
    const pdfId = String(item?._id || '');
    const isSaved = savedPdfIds.has(pdfId);
    const isSaving = savingId != null && String(savingId) === pdfId;
    return (
      <View style={styles.pdfCard}>
        <Pressable
          onPress={() => handleOpenPdf(item)}
          disabled={isOpening}
          style={({ pressed }) => [styles.pdfMainArea, pressed && styles.btnPressed, isOpening && styles.btnDisabled]}
        >
          <View style={styles.pdfIconWrap}>
            <Text style={styles.pdfIcon}>📄</Text>
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
          onPress={() => handleToggleSave(item)}
          hitSlop={8}
          disabled={isSaving}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.btnPressed, isSaving && styles.btnDisabled]}
        >
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={isSaved ? colors.primary : colors.muted}
          />
        </Pressable>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {showPremiumUpsell ? (
        <Pressable
          onPress={() => navigation.navigate('Premium', { from: 'pdf' })}
          style={({ pressed }) => [styles.premiumUpsell, pressed && styles.btnPressed]}
        >
          <Text style={styles.premiumUpsellTitle}>Full PDF notes library</Text>
          <Text style={styles.premiumUpsellSub}>
            Go Premium for unlimited access to every PDF on this device.
          </Text>
        </Pressable>
      ) : null}
      <Text style={styles.sectionTitle}>Post</Text>
      {renderPostChips()}

      <Text style={[styles.sectionTitle, styles.pdfSectionTitle]}>
        PDF Notes
      </Text>
      {renderPdfBody()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  premiumUpsell: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  premiumUpsellTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primaryText,
  },
  premiumUpsellSub: {
    fontSize: 13,
    color: colors.primaryText,
    marginTop: 4,
    lineHeight: 18,
    opacity: 0.9,
  },

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
  pdfIcon: { fontSize: 22 },
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

  btnPressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.6 },
});
