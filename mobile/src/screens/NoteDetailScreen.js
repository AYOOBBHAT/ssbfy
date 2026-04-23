import { useLayoutEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { EmptyState } from '../components/StateView';
import { colors } from '../theme/colors';

/**
 * Read a single note.
 *
 * The note is handed to us via `route.params.note` from NotesListScreen
 * (we already have the full document there, so no extra round-trip is
 * needed). If someone deep-links without the payload, we render a
 * friendly empty state instead of crashing.
 */
export default function NoteDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const note = route?.params?.note;

  // Use the note title as the header so the navigation chrome doubles
  // as context — matches the feel of the other detail screens in the app.
  useLayoutEffect(() => {
    if (note?.title) {
      navigation.setOptions({ title: note.title });
    }
  }, [navigation, note?.title]);

  // Split the content into paragraphs on blank lines so the reader sees
  // logical spacing even when the source text has minimal formatting.
  // We keep this conservative — we don't do full Markdown, just visual
  // breathing room.
  const paragraphs = useMemo(() => {
    const content = typeof note?.content === 'string' ? note.content : '';
    if (!content) return [];
    return content
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [note?.content]);

  if (!note) {
    return (
      <View style={styles.fallback}>
        <EmptyState
          title="Note unavailable"
          subtitle="Go back and pick a note from the list."
          emoji="📄"
        />
      </View>
    );
  }

  const hasContent = paragraphs.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator
    >
      <Text style={styles.title}>{note.title || 'Untitled note'}</Text>

      {hasContent ? (
        paragraphs.map((p, idx) => (
          <Text key={idx} style={styles.paragraph} selectable>
            {p}
          </Text>
        ))
      ) : (
        <Text style={[styles.paragraph, styles.emptyBody]}>
          This note is empty.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },

  fallback: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
    lineHeight: 28,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 26,
    color: colors.text,
    marginBottom: 14,
  },
  emptyBody: {
    color: colors.muted,
    fontStyle: 'italic',
  },
});
