# Development builds (TEC-4)

The repository is configured for physical-device development builds. No cloud
build, signing registration, account linking or device installation has been run.

## Link the team's accounts

From `app/`, run `npx eas-cli@latest login` and `npx eas-cli@latest init`.
Select the team's existing project or create one in the team's Expo account.
For this dynamic config, set the returned project UUID as `EAS_PROJECT_ID` in
`.env` (or accept EAS's suggested `extra.eas.projectId` update in app.json).
Do not commit an Expo access token.

Fill `.env` with the shared Supabase dev URL/anon key and restricted Android Maps
key. Add those same values and `EAS_PROJECT_ID` to the Expo project's **development**
environment. Use plain text for public IDs and sensitive visibility for the Maps
key; config evaluation needs it locally as well as remotely. Variables prefixed
`EXPO_PUBLIC_` are bundled into the app. No server/provider secrets belong there.
The build profile selects this environment; it does not upload your ignored `.env`.

## Apple and Google account owner steps

- Paid Apple Developer team: register `com.sidequest.app`, enable Sign in with Apple,
  and allow EAS to manage its signing credentials. Register each test iPhone using
  `npx eas-cli@latest device:create` before building. Enable Developer Mode on phones
  where required. The config plugin sets the entitlement; it cannot grant team access.
- Google Cloud: enable Maps SDK for Android and billing, create a key restricted to
  `com.sidequest.app` plus the EAS development keystore SHA-1. Obtain that fingerprint
  from `npx eas-cli@latest credentials -p android`. A different signing key needs a
  matching restriction. Rebuild after changing the embedded Maps key.
- Supabase: complete Apple, Google and email provider configuration in TEC-1.
  Sign-in screens and the map screen are separate feature issues.

## Build and install

```sh
cd app
npm ci
npm run typecheck
npm run lint
npx eas-cli@latest build --platform ios --profile development
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

Install each artifact using its EAS build page. Android produces an APK. iOS uses
internal distribution for registered physical phones, not a simulator build.
Keep Metro reachable on the same network (or use Expo's tunnel option).
Rebuild when native dependencies, signing, capabilities or Maps configuration change.

## Three-phone verification record — all pending

| Phone | OS/build ID | Opens app | Same dev project | Sign-in | Map visible |
| --- | --- | --- | --- | --- | --- |
| iPhone | Pending | Pending | Pending | Apple pending | Pending |
| Android | Pending | Pending | Pending | Google pending | Pending |
| Third phone (team selects OS) | Pending | Pending | Pending | Pending | Pending |

Use this as an installation check, not a demo script. Once feature screens exist,
verify sign-in, session persistence after restart, nonblank map tiles, and consistent
shared data on all phones. A person must record results before closing TEC-4.

References: [development profiles](https://docs.expo.dev/build/eas-json/),
[Apple capability](https://docs.expo.dev/versions/v58.0.0/sdk/apple-authentication/),
[Android Maps setup](https://docs.expo.dev/versions/v58.0.0/sdk/map-view/),
[build environment](https://docs.expo.dev/eas/environment-variables/).
