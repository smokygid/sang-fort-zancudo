# SANG Mobile

Cross-platform mobile client for the San Andreas National Guard portal.

## Stack

- React Native + Expo SDK 58
- TypeScript
- Android and iOS from one codebase
- Existing SANG website remains the source of truth

## Run locally

```bash
cd mobile
npm install
npx expo start
```

Use a development build for device testing and production builds through EAS Build.

## Current milestone

The first native dashboard prototype is in place. It establishes the dark navy / gold visual language, quick-access service modules, command news cards, and bottom navigation.

## Planned integration

1. Inspect and document the existing SANG authentication/session flow.
2. Add a dedicated mobile API contract to the Cloudflare Pages Functions backend.
3. Implement secure token storage and login/logout.
4. Replace prototype dashboard data with live news and account data.
5. Add role-based access, electronic military ID and QR verification.
6. Add push notifications and EAS Android/iOS builds.

## Security

Do not embed `SHEETS_API_SECRET`, `SANG_API_SECRET`, service credentials, or other server secrets in the mobile application. All privileged requests must go through the SANG backend.
