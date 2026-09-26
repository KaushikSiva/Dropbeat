# Validation for v0.1.0

Checked locally on 26 September 2026:

- The standalone native target builds with Xcode 27.1 for the Duo simulator.
- The native clipboard roundtrip UI test passes: copy → change text → paste restores the original prompt.
- All 9 studio unit tests pass (cue semantics, bundled assets, time formatting, lyric constraints and bounded Blender plans).
- TypeScript checks and ESLint pass.
- The Next.js production build succeeds.
- A fresh, unconfigured studio loads in Chrome, reports no provider credentials, and plays the bundled example without JavaScript errors.
- A cross-origin attempt to invoke the Mac picker is rejected.
- Staged files were checked for known local credentials, common secret patterns, private/generated folders, and oversized assets before publication.

The paid live provider test was not rerun just to publish this extraction. The previous local app was used to generate the demo material described in [DEMO.md](DEMO.md). Model behaviour and latency remain variable. Physical-device deployment has not been validated.

A manual GitHub Actions workflow is included; no hosted CI pass is claimed. Run it from the Actions tab when desired.
