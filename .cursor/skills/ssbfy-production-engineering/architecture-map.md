# SSBFY Architecture Map

Canonical ownership — extend these paths; do not fork parallel systems.

## Assessment issuance & reveal

| Concern | Location |
|---------|----------|
| Issuance model | `backend/src/models/PracticeIssuance.js` |
| Issuance service | `backend/src/services/practiceIssuanceService.js` |
| Issuance repository | `backend/src/repositories/practiceIssuanceRepository.js` |
| Reveal service | `backend/src/services/practiceRevealService.js` |
| Practice API | `backend/src/controllers/practiceController.js` |
| Mobile practice client | `mobile/src/services/practiceService.js` |

## Learning sessions & analytics

| Concern | Location |
|---------|----------|
| Session model | `backend/src/models/LearningSession.js` |
| Session service | `backend/src/services/learningSessionService.js` |
| Session repository | `backend/src/repositories/learningSessionRepository.js` |
| Snapshot utils | `backend/src/utils/learningSessionSnapshot.js` |
| Mobile session client | `mobile/src/services/learningSessionService.js` |
| Mobile session cache | `mobile/src/utils/learningSessionCache.js` |

## Scoring (single pipeline)

| Concern | Location |
|---------|----------|
| Question scoring | `backend/src/utils/questionScoring.js` |
| Test attempts | `backend/src/services/testAttemptService.js` |
| Question service | `backend/src/services/questionService.js` |

## Results & review hydration

| Concern | Location |
|---------|----------|
| Result screen | `mobile/src/screens/ResultScreen.js` |
| Review payload | `mobile/src/utils/resultReviewPayload.js` |
| Review screen | `mobile/src/screens/ReviewAnswersScreen.js` |
| Test screen | `mobile/src/screens/TestScreen.js` |

## Battle mode

| Concern | Location |
|---------|----------|
| Battle service (BE) | `backend/src/services/battleService.js` |
| Battle history | `backend/src/services/battleHistoryService.js` |
| Battle model | `backend/src/models/BattleSession.js` |
| Battle routes | `backend/src/routes/battleRoutes.js` |
| Mobile battle client | `mobile/src/services/battleService.js` |
| Battle screens | `mobile/src/screens/Battle*.js` |

## Mobile layout: safe area & keyboard

| Concern | Location |
|---------|----------|
| Bottom CTA bar | `mobile/src/components/layout/SafeBottomActionBar.js` |
| Bottom insets hook | `mobile/src/hooks/useBottomSafeInsets.js` |
| Keyboard container | `mobile/src/components/layout/ScreenKeyboardContainer.js` |
| Keyboard scroll | `mobile/src/components/layout/KeyboardSafeScrollView.js` |
| Form shell | `mobile/src/components/layout/FormScreenShell.js` |
| Keyboard insets | `mobile/src/hooks/useKeyboardInsets.js` |
| Keyboard config | `mobile/src/utils/keyboardConfig.js` |

## Topic lineage

| Concern | Location |
|---------|----------|
| Canonical map | `backend/src/models/TopicCanonicalMap.js` |

## Navigation

| Concern | Location |
|---------|----------|
| App navigator | `mobile/src/navigation/AppNavigator.js` |
| Entry | `mobile/App.js` |
