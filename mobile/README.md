# SANG Mobile

Native cross-platform mobile client for the San Andreas National Guard portal.

## Stack

- React Native + Expo SDK 58
- TypeScript
- Android and iOS from one codebase
- Expo SecureStore for device-protected session storage
- Existing SANG Cloudflare backend remains the source of truth

## Run locally

```bash
cd mobile
npm install
npx expo start
```

Use an Expo development build for device testing and EAS Build for Android/iOS binaries.

## Current milestone: authentication foundation

- Native sign-in using the existing service number and password.
- Mobile-only login response returns a random session token.
- The server stores only the SHA-256 digest of the session token, matching the existing session table.
- Mobile requests authenticate with `Authorization: Bearer <token>`.
- The token is stored using Expo SecureStore and removed on logout.
- Existing browser login continues to use its HttpOnly Secure cookie.
- The app loads the authenticated personnel profile and published SANG news.
- Mandatory first-login password changes are respected: the app directs the user to complete the existing web flow first.

## Backend changes included on this branch

- `functions/api/auth/_session.js`: reads a bearer token or the existing session cookie.
- `functions/api/auth/login.js`: returns a session token only when `clientType: "mobile"` is supplied; browser login remains cookie-based.
- `functions/api/auth/logout.js`: revokes either a bearer-token or cookie session.
- `functions/api/profile.js`: accepts either session method.

These backend changes must be deployed to the SANG Cloudflare Pages project before mobile sign-in can work against production. They are isolated on the `mobile-app` branch and do not change the live site's main branch until merged/deployed.

## Security notes

- Never put `SHEETS_API_SECRET`, `SANG_API_SECRET`, database credentials, or other server secrets in the app.
- The mobile token is short-lived (8 hours), revocable, and stored in Keychain/Keystore through SecureStore.
- Passwords are sent only to the HTTPS login endpoint and are not saved on-device.
- Do not log session tokens or password values.

## Next steps

1. Deploy this branch to a Cloudflare Pages preview and verify the mobile auth flow.
2. Test valid credentials, invalid credentials, inactive accounts, expired sessions, logout and mandatory password change.
3. Add role-aware navigation, personnel ID QR verification, notifications and remaining cabinet modules.
4. Prepare signed Android and iOS builds with EAS.
