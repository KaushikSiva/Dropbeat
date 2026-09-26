# Contributing to DropBeat

Help make directing a music video feel as simple as dropping a picture.

1. Fork the repository and create a branch for one change.
2. Follow the [setup guide](docs/SETUP.md). You do not need provider keys for unit tests or interface work.
3. Keep the main flow simple: opening idea → picture drops → finished video. Put optional configuration in Advanced.
4. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` in `studio`.
5. For native changes, build the MusicVideo scheme and test import, drag feedback, rotation, and playback in the Duo simulator.
6. Open a pull request describing the user-visible change and how you checked it. Add a screenshot or short recording for UI changes.

Do not commit credentials, personal picture libraries, generated takes, local settings, build outputs or provider responses containing private data. The opt-in MusicVideoLive test makes paid provider calls; ordinary tests should not.

Useful areas to work on:

- Recovery and retry when a live provider disconnects.
- Better alignment between vocal phrases, captions and scene cues.
- Cue history and undo with clear acceptance feedback.
- Physical-device validation and smaller-screen accessibility.
- New musical styles with original vocal direction.

For larger changes, start with an issue so the design can be discussed before implementation. Dependencies and provider APIs change; keep setup instructions aligned with the code you change.
