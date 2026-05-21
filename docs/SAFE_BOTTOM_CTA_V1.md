# Safe Bottom CTA — Implementation Report

## Problem

On real Android devices (3-button nav, gesture bar, tall bottom inset), bottom actions in Test and Review flows were partially obscured. Fixed `paddingBottom: 32` was insufficient and inconsistent.

## Affected screens / components

| Screen / component | Bottom UI | Fix applied |
|--------------------|-----------|-------------|
| `TestScreen.js` | Prev/Next, Skip/Mark review, Finish Practice, Submit Test | `SafeBottomActionBar` |
| `ResultScreen.js` | Next steps, Retry, Review answers, back footer (scroll) | `useBottomSafeInsets` on `ScrollView` content |
| `ReviewAnswersScreen.js` | FlatList review (historical + post-reveal) | `useBottomSafeInsets` on list content |
| `BattleResultScreen.js` | Done CTA (battle comparison) | `useBottomSafeInsets` on scroll content |

**Not changed (out of scope):** Practice setup (`SmartPracticeScreen`), Profile, auth shells (already use `SafeAreaView`), tab bar (`AppNavigator`).

**Flows covered via `TestScreen`:** Daily, Practice/Topic, Mock, Battle, Retry.

## Chosen safe-area strategy

1. **`react-native-safe-area-context`** — already wrapped at app root (`SafeAreaProvider` in `App.js`).
2. **`useBottomSafeInsets()`** — single hook for padding math:
   - `bottom` = `max(insets.bottom, 8)` on Android (gesture bar floor)
   - `actionBarPadding` = `bottom + 12` (fixed footer CTAs)
   - `scrollContentPadding` = `actionBarPadding + extraScrollPadding` (scroll/list clearance)
3. **`SafeBottomActionBar`** — fixed footer wrapper for Test flows only (scroll stays `flex: 1` above bar).

No per-screen magic numbers (`40`, `32`) for test/result/review bottoms.

## Reusable footer solution

| File | Role |
|------|------|
| `mobile/src/hooks/useBottomSafeInsets.js` | Inset math + style fragments |
| `mobile/src/components/layout/SafeBottomActionBar.js` | Fixed bottom CTA stack |
| `mobile/src/utils/safeAreaDevLog.js` | DEV-only `[SafeArea]` logs |

### Test layout pattern

```
View (container, no bottom padding)
  ├── header / countdown / summary
  ├── ScrollView (flex 1)
  └── SafeBottomActionBar
        ├── nav (Prev/Next)
        ├── mock secondary (Skip/Mark)
        └── Finish / Submit
```

### Scroll-only screens (Result, Review, BattleResult)

`contentContainerStyle={[styles.content, bottomInsets.scrollContentStyle]}` so the last card/button clears the system inset.

## Android edge cases

| Case | Handling |
|------|----------|
| `insets.bottom === 0` on Android | Floor `8px` minimum before base padding |
| Gesture navigation | Uses OS inset when reported |
| 3-button navigation | Uses OS inset when reported |
| Tall inset devices | Full `insets.bottom` + 12px base |
| Small screens | No extra large gaps — only inset + 12 (+ optional 16 scroll extra) |

## DEV instrumentation

When `__DEV__`:

- `[SafeArea] insets_resolved` — screen, bottom, padding values
- `[SafeArea] bottom_action_bar_active` — Test footer activation

No production logging.

## Remaining risks

1. **Keyboard open on Test** — No `KeyboardAvoidingView` added; out of scope. Mock/practice rarely use keyboard on options.
2. **Android inset 0 on older WebView/Expo builds** — Floor mitigates but cannot exceed real nav height if OS reports 0 incorrectly.
3. **Tab bar + stack screens** — Test/Result are root stack screens; tab bar not overlapping, but very tall tab bars untested.
4. **Landscape** — Not explicitly tuned; insets usually adjust automatically.

## Rollout safety

- **Layout-only** — No scoring, reveal, hydration, or navigation logic touched
- **Additive components** — Hook + bar; screens opt in explicitly
- **Rollback** — Revert 4 screen files + delete 3 shared files

## Verification checklist

- [ ] Android gesture nav: Finish Practice fully tappable
- [ ] Android 3-button nav: Submit Test not under buttons
- [ ] Result: last Retry / Review CTA above nav bar
- [ ] Review Answers: last question card scrolls above inset
- [ ] Battle Result: Done button fully visible
