# Battle History V1.1 — Implementation Report

## Overview

Battle History is an **engagement + continuity** layer on top of Battle V1. It does not change issuance, reveal, scoring, or `BattleResult` architecture.

| Capability | Implementation |
|------------|----------------|
| Profile section | `BattleHistorySection` under practice/mock activity |
| Server summary | `GET /api/battles/history` |
| Pending first | `pendingBattles` before `recentBattles` |
| Re-entry | `reopenAction` → `BattleLobby` or `BattleResult` |
| DEV logs | `battleHistoryDevLog` (`__DEV__` only) |

---

## Backend API design

### `GET /api/battles/history`

Authenticated, rate-limited (same `/battles` router).

**Query (optional):**

| Param | Default | Max |
|-------|---------|-----|
| `recentLimit` | 20 | 40 |
| `recentSkip` | 0 | 200 |

**Response:**

```json
{
  "summary": { "wins", "losses", "ties", "pendingCount" },
  "pendingBattles": [ /* history rows */ ],
  "recentBattles": [ /* history rows */ ],
  "recentOpponents": [ /* lightweight opponent chips */ ],
  "pagination": { "recentLimit", "recentSkip", "hasMoreRecent" }
}
```

### History row (lightweight)

No `LearningSession` hydration. Built from `BattleSession` + batched name lookups:

- `uxStatus`, `headline`, `scoreLine`, `outcome`, `reopenAction`
- `topicLabel`, `opponentDisplayName`, scores, timestamps
- `yourAttemptComplete` for future UX (rematch/streaks)

**Files:**

- `backend/src/services/battleHistoryService.js`
- `backend/src/utils/battleHistoryPresentation.js`
- `backend/src/constants/battleHistory.js`
- `backend/src/repositories/battleSessionRepository.js` (pending/recent/aggregate queries)

---

## UX status model

Derived viewer-centric (`deriveBattleUxStatus`), not raw `BattleSession.status`:

| UX status | Meaning |
|-----------|---------|
| `waiting` | Creator; no opponent joined |
| `active` | Your turn (or both in progress, you not finished) |
| `awaiting_opponent` | You finished; opponent has not |
| `completed` | Battle finalized |
| `expired` | Past `expiresAt` or marked expired |

`backendStatus` is included on rows for debugging only; UI uses `uxStatus` + `headline`.

---

## Pending battle strategy

1. **Query:** `status ∈ {waiting, active}` AND `expiresAt > now` (indexed).
2. **Lazy expiry:** Each row passed through `markExpiredIfNeeded`; expired rows dropped from pending list (surface under recent on next fetch).
3. **Sort:** `active` → `awaiting_opponent` → `waiting`, then `updatedAt` desc.
4. **`pendingCount`:** `countDocuments` on same filter (for summary chip).

---

## Summary computation

| Field | Source |
|-------|--------|
| `wins` / `losses` / `ties` | Mongo aggregation on `status: completed` battles with opponent |
| `pendingCount` | Count of non-expired pending query |

No client-side scanning of full battle arrays.

---

## Reopen flow handling

| `reopenAction` / status | Navigation |
|-------------------------|------------|
| `lobby` | `BattleLobby` (share, play, wait) |
| `result` | `BattleResult` (existing comparison API) |
| `expired` | `BattleLobby` (read-only expired state) |

**Integrity preserved:**

- Play still goes through `POST /battles/:id/start` → existing issuance rules
- No replay from history (completed → result only)
- No second issuance from history UI

**DEV logs:** `reopen`, `reopen_stale`, `lobby_expired`, `fetch_*`

---

## Recent opponents

From last completed rows in `recentBattles` (max 8 unique opponent user IDs):

- `displayName`, `lastBattleAt`, `lastOutcome`, `lastBattleId`
- No friend graph / profiles / follow

Future: rematch CTA can use `lastBattleId` + opponent id.

---

## Mobile UX decisions

- **Placement:** Profile → Progress card → below Recent practice / Recent mocks
- **Summary row:** Wins · Losses · Ties · Pending (compact 4-up)
- **Pending subheading** above in-progress rows
- **Battle cards:** Flash icon, headline-first (competitive tone), outcome chip (Win/Loss/Play/etc.)
- **Empty state:** CTA → `BattleCreate`
- **Refresh:** `useFocusEffect` reload on Profile tab focus
- **Visual:** `sessionActivityVisual` extended with `battle` / `win` / `loss` / `tie` / `pending`

**Files:**

- `mobile/src/components/profile/BattleHistorySection.js`
- `mobile/src/hooks/useBattleHistory.js`
- `mobile/src/utils/battleHistoryDevLog.js`
- `mobile/src/services/battleService.js` → `getBattleHistory`

---

## Remaining risks

1. **Pending vs expired race** — Row can expire between list fetch and tap; lobby shows expired (logged in DEV).
2. **Summary lag** — Wins/losses only count `completed` with opponent; abandoned active battles don’t affect W-L-T.
3. **Pagination** — `hasMoreRecent` exposed; Profile V1.1 loads first page only (no “View all battles” screen yet).
4. **Name quality** — Opponent label from `name` or email local-part only.
5. **Creator waiting forever** — Stays in pending until expiry; no push to opponent.

---

## Rollout safety

- **Additive:** New route + Profile UI; Battle V1 paths unchanged
- **Read-only history:** No writes from `/history`
- **Query bounded:** Pending cap 30, recent cap 40
- **Rollback:** Remove route mount + `BattleHistorySection` import

---

## Future hooks (not implemented)

- `row.yourAttemptComplete` + `opponentUserId` → rematch
- `summary` extension → streaks / seasonal stats
- `pagination` → full Battle History screen
- Push when `uxStatus === awaiting_opponent` for opponent
