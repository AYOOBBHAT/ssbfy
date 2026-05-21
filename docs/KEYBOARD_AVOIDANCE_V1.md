# Keyboard avoidance v1 — implementation report

Production-safe keyboard handling for all form-driven flows without changing auth architecture, navigation, battle logic, or test/review hydration.

## Strategy chosen

**Centralized two-layer pattern** (no scattered `KeyboardAvoidingView`, no third-party keyboard library):

| Layer | Component | Role |
|-------|-----------|------|
| Container | `ScreenKeyboardContainer` | iOS: `KeyboardAvoidingView` + centralized offset presets. Android: plain `View` + `adjustResize` (no KAV — avoids double padding / jumpiness with edge-to-edge). |
| Scroll | `KeyboardSafeScrollView` | `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`, scroll-to-focused-input via `UIManager.measureLayout`, light extra bottom padding when keyboard visible. |
| Stack forms | `FormScreenShell` | Composes container + scroll for authenticated stack screens. |
| Auth | `AuthScreenShell` | Same primitives; keeps ambient background + safe area + auth insets. |

**Config:** `mobile/src/utils/keyboardConfig.js` — behavior, offset presets (`auth`, `stackHeader`), scroll delay per platform.

**DEV logs:** `mobile/src/utils/keyboardDevLog.js` — `[Keyboard]` events only in `__DEV__`.

**Insets hook:** `mobile/src/hooks/useKeyboardInsets.js` — one listener per screen using `KeyboardSafeScrollView`.

## Shared abstractions added

```
mobile/src/utils/keyboardConfig.js
mobile/src/utils/keyboardDevLog.js
mobile/src/hooks/useKeyboardInsets.js
mobile/src/components/layout/ScreenKeyboardContainer.js
mobile/src/components/layout/KeyboardSafeScrollView.js
mobile/src/components/layout/FormScreenShell.js
```

`AuthField` registers focus with `useKeyboardSafeField()` for automatic scroll-into-view.

## Android / iOS differences

| Platform | Avoidance | Scroll-to-field | Config |
|----------|-----------|-----------------|--------|
| **iOS** | `KeyboardAvoidingView` `padding` + preset offset (auth: 4px; stack: safe top + 56px header) | 60ms delay after focus | Notch via safe area in offset preset |
| **Android** | `softwareKeyboardLayoutMode: "resize"` in `app.json` (maps to `adjustResize`); **no** KAV | 120ms delay after focus | Edge-to-edge + resize shrinks window; small dynamic scroll padding when keyboard open |

## Affected screens

### Updated (keyboard-safe)

| Screen | Path | Change |
|--------|------|--------|
| Login | `LoginScreen.js` | Via `AuthScreenShell` → shared container + scroll |
| Signup | `SignupScreen.js` | Same |
| Forgot password | `ForgotPasswordScreen.js` | Same |
| OTP verification | `VerifyOtpScreen.js` | Same |
| Reset password | `ResetPasswordScreen.js` | Same |
| Change password | `ChangePasswordScreen.js` | Migrated to `FormScreenShell`; removed duplicate KAV |
| Join battle | `BattleJoinScreen.js` | **Fixed** — was bare `View` + `TextInput`; now `FormScreenShell` + scroll-to-field |

### Verified unchanged (intentionally no keyboard layer)

| Screen | Reason |
|--------|--------|
| TestScreen | MCQ only; no `TextInput` — `SafeBottomActionBar` unchanged |
| ResultScreen | No inputs |
| ReviewAnswersScreen | No inputs |
| Battle create / lobby / result | No text inputs (chips/share only) |
| Notes/PDF/Tests lists | Chip filters only; no search `TextInput` yet |
| Profile | Read-only; links to Change Password |
| Premium / SmartPractice | No keyboard fields |

### Modals / bottom sheets

None in codebase today. Future modals should use the same `ScreenKeyboardContainer` + `KeyboardSafeScrollView` or sheet `keyboardBehavior`.

## Audit findings (pre-fix)

1. **Auth flows** — Had KAV in `AuthScreenShell` but no scroll-to-focused; Android used `behavior="height"` (jump risk).
2. **Change password** — Duplicate KAV; no stack header offset on iOS; no scroll-to-focused.
3. **Battle join** — **Critical gap**: keyboard could cover code field and Join CTA.
4. **Android** — No explicit `adjustResize`; `edgeToEdgeEnabled` without documented keyboard mode.
5. **Search/filter** — No text search inputs present.
6. **Test/result/review** — Already safe (no hidden focus).

## Bottom CTA protection

- Auth: Login / Signup / OTP / Reset CTAs live inside `KeyboardSafeScrollView` — user can scroll to submit with keyboard open.
- Change password: Update button at scroll bottom with extra padding.
- Battle join: Join button scrollable above keyboard.

## Performance

- Keyboard listeners only on screens mounting `KeyboardSafeScrollView` (not app root).
- Single `measureLayout` per focus (deferred via `requestAnimationFrame` timing).
- No re-render on every keyboard frame — only show/hide toggles padding.

## Accessibility

- `keyboardShouldPersistTaps="handled"` — submit/links tappable with keyboard open.
- `keyboardDismissMode="on-drag"` — dismiss on scroll.
- Battle join button: `accessibilityRole` / `accessibilityLabel` added.
- Focused fields scroll into view with 56px buffer.

## Remaining risks

| Risk | Mitigation / note |
|------|------------------|
| **Real-device QA required** | `adjustResize` + edge-to-edge varies by OEM; test gesture vs 3-button nav, small/tall phones. |
| **Prebuild required for Android manifest** | `softwareKeyboardLayoutMode` applies on next `expo prebuild` / EAS build, not Expo Go alone. |
| **iOS stack header height** | Offset uses `insets.top + 56`; if header style changes, update `STACK_HEADER_BODY_HEIGHT`. |
| **Landscape** | App is portrait-locked; landscape not in scope. |
| **Future search bars** | Wrap list parent with `FormScreenShell` or `KeyboardSafeScrollView` when adding `TextInput`. |
| **Future modals** | No pattern yet — plan keyboard wrapper at add time. |
| **`colors.background` on battle screens** | Pre-existing undefined token on some battle screens; Battle Join now uses `colors.bg`. |

## Rollout safety

- **Low blast radius**: No auth service, navigation, battle API, or test hydration changes.
- **Additive utilities**; auth screens keep same visual structure (`AuthScreenShell` API unchanged).
- **Android behavior change**: `resize` is standard for forms; may slightly change window resize vs default — validate on one physical device before wide release.
- **Rollback**: Revert `app.json` keyboard mode + shell imports; screens are isolated.

## DEV instrumentation

In development builds, watch Metro logs:

```
[Keyboard] keyboard_show { height, platform }
[Keyboard] keyboard_hide { platform }
[Keyboard] scroll_to_field { y, height, targetY, keyboardHeight }
[Keyboard] scroll_measure_fail {}
```

## Recommended device test checklist

1. Login — focus password, tap Login with keyboard open (iOS + Android).
2. Signup — last field + Sign up CTA visible.
3. Forgot → OTP → Reset — OTP field and Continue not covered.
4. Change password — confirm field + Update password reachable.
5. Join battle — code field focus, Join battle tappable (Android gesture nav).
6. Test / Result / Review — confirm keyboard never opens unexpectedly.
7. Cold start after EAS build — confirm Android resize active (field not under keyboard without scroll).
