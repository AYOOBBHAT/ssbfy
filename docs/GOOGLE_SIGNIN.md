# Google Sign-In for SSBFY

Production-safe Google authentication as an **additional** login method. Email/password auth is unchanged.

## Architecture

1. Mobile obtains a Google **ID token** via `@react-native-google-signin/google-signin`.
2. Mobile sends `{ idToken }` to `POST /api/auth/google`.
3. Backend verifies the token with `google-auth-library` (signature, audience, issuer, expiry, `email_verified`).
4. Backend resolves/links/creates the user and returns the same `{ user, token }` shape as `/auth/login`.

Never trust profile data from the client without verifying the ID token.

## Google Cloud Console setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **OAuth consent screen**.
   - User type: **External** (or Internal if Workspace-only).
   - Add app name, support email, and scopes: `email`, `profile`, `openid`.
   - Add test users while in **Testing**; publish when ready for production.

2. APIs & Services → **Credentials** → Create credentials → **OAuth client ID**.

### Android client (required for native sign-in)

- Application type: **Android**
- Package name: `com.ayoobbhat.ssbfy`
- SHA-1 certificate fingerprint: from EAS / local keystore (see below)

Create separate clients for **development** and **production** if keystores differ.

### Web client (required as `webClientId` / server audience)

- Application type: **Web application**
- No redirect URI needed for native ID-token flow
- Copy the client ID into:
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (mobile)
  - `GOOGLE_WEB_CLIENT_ID` (backend audience allowlist)

### Backend audience

Set both on the API:

```env
GOOGLE_ANDROID_CLIENT_ID=<android-oauth-client-id>
GOOGLE_WEB_CLIENT_ID=<web-oauth-client-id>
```

The verifier accepts ID tokens whose `aud` matches either client ID.

## SHA-1 / SHA-256 fingerprints (Android)

For EAS production builds:

```bash
cd mobile
eas credentials -p android
```

Copy **SHA-1** and **SHA-256** from the keystore EAS uses and add them to the Android OAuth client in Google Cloud.

For local debug builds, also add the debug keystore fingerprint:

```bash
keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```

## Mobile environment variables

Copy `mobile/.env.example` → `mobile/.env`:

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=yyyy.apps.googleusercontent.com
```

Restart Expo / rebuild EAS after changing `EXPO_PUBLIC_*` values.

## Backend environment variables

Copy `backend/.env.example` entries:

```env
GOOGLE_ANDROID_CLIENT_ID=yyyy.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
```

If unset, `POST /api/auth/google` returns `GOOGLE_AUTH_UNAVAILABLE` (503).

## MongoDB index (one-time deploy step)

After deploying the User schema change, run from `backend/`:

```bash
npm run build:indexes
```

This creates `uniq_authProviders_google_sub` (sparse unique on `authProviders.google.sub`).

Do **not** enable `SYNC_INDEXES` in production.

## Account linking rules

| Case | Behavior |
|------|----------|
| A — New Google user | Create account with Google `sub`; issue JWT |
| B — Existing email/password + same verified Google email | Link Google to existing user; preserve all progress |
| C — Returning Google user | Match by `sub` first; issue JWT |
| D — Google email changed | `sub` is stable; update provider email only |
| E — Duplicate email rows | `GOOGLE_ACCOUNT_CONFLICT`; logged server-side |
| F — Unverified Google email | `GOOGLE_EMAIL_NOT_VERIFIED` |

Linking updates only `authProviders.google`, `emailVerified`, and safe provider metadata — never streaks, attempts, subscription, or payment fields.

## Manual QA checklist

- [ ] New user signs up through Google
- [ ] Existing password user signs in with matching verified Google email (linked, not duplicated)
- [ ] Google user logs out and logs back in
- [ ] Email/password login still works after linking
- [ ] Google picker cancellation is silent (no alert, no Sentry)
- [ ] Slow network / single retry behavior
- [ ] Concurrent first-time Google logins do not create duplicate users
- [ ] Wrong OAuth audience rejected (`GOOGLE_TOKEN_INVALID`)
- [ ] Unverified Google email rejected
- [ ] Streaks / premium / attempts unchanged after linking
- [ ] App reinstall + Google login
- [ ] Logout during Google/backend flow does not restore session
- [ ] Production EAS APK/AAB build (not only Expo Go)
- [ ] Backend unavailable shows retryable message

## Security notes

- ID tokens are verified only on the backend.
- `idToken` is never logged in HTTP access logs (body is not serialized).
- Endpoint is rate-limited with `authLimiter` like `/auth/login`.
- No Google client secrets in the mobile app.
