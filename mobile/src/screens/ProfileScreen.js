import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { colors, brand } from '../theme/colors';
import { userHasPremiumAccess } from '../utils/premiumAccess';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const name = user?.name || 'Student';
  const isPremium = userHasPremiumAccess(user);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={colors.primary} />
        </View>
        <Text style={styles.name}>{name}</Text>
        {user?.email ? (
          <Text style={styles.email} numberOfLines={1}>
            {user.email}
          </Text>
        ) : null}
        {isPremium ? (
          <View style={styles.premiumPill}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.premiumPillText}>Premium active</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => navigation.navigate('ChangePassword')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Ionicons name="lock-closed-outline" size={22} color={colors.text} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Change Password</Text>
            <Text style={styles.rowSub}>Update your account password securely</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.card}>
        <Pressable
          onPress={() =>
            isPremium
              ? navigation.navigate('SavedMaterials')
              : navigation.navigate('Premium', { from: 'saved-materials' })
          }
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Ionicons
            name={isPremium ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={isPremium ? colors.primary : colors.muted}
          />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Saved Materials</Text>
            <Text style={styles.rowSub}>
              {isPremium ? 'Your bookmarked notes and PDFs' : 'Premium feature'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </View>
      {!isPremium ? (
        <View style={styles.card}>
          <Pressable
            onPress={() => navigation.navigate('Premium', { from: 'profile' })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Ionicons name="star-outline" size={22} color={colors.primary} />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Go Premium</Text>
              <Text style={styles.rowSub}>Unlimited practice & full library</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      <Text style={styles.brandFoot}>
        {brand.name} — {brand.tagline}
      </Text>

      <Text style={styles.sectionLabel}>Session</Text>
      <Pressable
        onPress={logout}
        style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
      >
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  email: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
    maxWidth: '100%',
    paddingHorizontal: 24,
  },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.success,
  },
  premiumPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  brandFoot: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  pressed: { opacity: 0.85 },
});
