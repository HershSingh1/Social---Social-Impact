# Core UI kit (TEC-6)

Shared components live in `app/src/ui/index.tsx`. The development-only gallery is
`/dev/ui-kit` (`sidequest://dev/ui-kit` in a development build); release builds
redirect away from it. Buttons handle async progress, synchronous double-tap locking
and recoverable errors. Fields are controlled by their caller and retain input.
Screen and Sheet provide safe areas and scrolling; status labels use words.

## Figma access is still required

The connected Figma account was denied access to both design context and variables
for [Event Planning App](https://www.figma.com/design/CUXYzgoB8YBvoorBUj1Oly/Event-Planning-App?node-id=28-2943).
Figma requested editor access. The existing placeholder colors, spacing, radii and
type scale are deliberately unchanged. These are functional components, not a
verified reproduction of the style guide. No guessed font family or shadows were added.

After the file owner grants access: extract Style Guide variables with their exact
names, inspect component frames, load the licensed font assets through `expo-font`,
replace the placeholder theme and compare the gallery with Figma.

## Verification

Run `cd app && npm ci && npm run typecheck && npm run lint && npm test`.
On both platforms, set text size to 200% and check wrapping, scrolling, labels,
44-point targets, sheet dismissal/focus, keyboard visibility and input retention.
Repeatedly tap the slow action: its count should increase only once while pending.
Tap Failed action: the error should appear and the action should become available again.
Image failure should show an initial. Release builds must redirect `/dev/ui-kit`.
Verified: typecheck, lint, three component behavior tests, and iOS/Android JavaScript
bundle export. Visual comparison and physical-device accessibility checks remain pending.
