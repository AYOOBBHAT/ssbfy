import { forwardRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';

/**
 * Labelled text field for the auth screens.
 *
 * Visuals:
 *   - Label above the input (13px, medium weight) for clear affordance.
 *   - Neutral border at rest, primary-blue border on focus so the user
 *     has a strong, obvious "what's active" signal.
 *   - Optional right-side adornment area — used by the password fields
 *     to host a Show / Hide toggle without breaking field alignment.
 *
 * Deliberately kept dumb: all state (value, focus-driven behavior, etc.)
 * lives in the parent. This component only owns the "is this field
 * currently focused?" visual flag.
 */
const AuthField = forwardRef(function AuthField(
  {
    label,
    value,
    onChangeText,
    placeholder,
    editable = true,
    secureTextEntry = false,
    autoCapitalize = 'sentences',
    keyboardType = 'default',
    autoCorrect = true,
    textContentType,
    autoComplete,
    returnKeyType = 'next',
    onSubmitEditing,
    rightAdornment = null,
  },
  ref
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          !editable && styles.inputRowDisabled,
        ]}
      >
        <TextInput
          ref={ref}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          editable={editable}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          autoCorrect={autoCorrect}
          textContentType={textContentType}
          autoComplete={autoComplete}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={colors.primary}
        />
        {rightAdornment ? (
          <View style={styles.adornment}>{rightAdornment}</View>
        ) : null}
      </View>
    </View>
  );
});

export default AuthField;

/**
 * Compact Show / Hide pill used on password fields. Kept here so the two
 * auth screens share identical password-toggle visuals without duplicating
 * style declarations.
 */
export function PasswordToggle({ visible, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      style={({ pressed }) => [
        styles.toggle,
        pressed && !disabled && styles.togglePressed,
        disabled && styles.toggleDisabled,
      ]}
    >
      <Text style={styles.toggleText}>{visible ? 'Hide' : 'Show'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  inputRowFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    // Pull in the padding by the extra border so the input doesn't
    // visually shift 0.5px when focused.
    paddingHorizontal: 13.5,
  },
  inputRowDisabled: {
    backgroundColor: '#f3f4f6',
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 12,
  },
  adornment: {
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggle: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  togglePressed: { opacity: 0.7 },
  toggleDisabled: { opacity: 0.5 },
  toggleText: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
