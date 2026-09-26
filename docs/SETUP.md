# Setup and troubleshooting

## Browser studio

Use Node.js **22.13+ LTS or 24+ LTS**, then run `npm ci` inside `studio`. Copy `.env.example` to `.env.local`, add your own credentials, and run `npm run dev`. Open `http://127.0.0.1:3211`.

The first load compiles the application. Without provider keys, use the bundled example and browser preview. The preview is not cloud-generated footage.

## Native Duo app

Use Xcode 27.1 with the iOS 27.1 Duo SDK. Run `npm ci` inside `studio` first, then open `MusicVideo.xcodeproj`, choose the MusicVideo scheme and a Duo simulator, and Run. Xcode starts a loopback Next.js server through `scripts/start-studio.sh`.

Stop an existing manually started studio before Xcode starts its simulator instance. You can stop the Xcode-launched process using the PID recorded in `studio/.ios-runtime/server.pid`. Do not kill an unrelated listener to free the port.

The opening prompt supports normal text selection plus visible **Paste** and **Copy** controls. On Simulator, Paste uses the simulator clipboard; copy your text into that clipboard using the simulator’s clipboard synchronization or paste command.

The only native Advanced setting is the server address. Provider keys can be configured in `studio/.env.local` or the browser studio’s Advanced panel. The default simulator address is `http://127.0.0.1:3211`.

The native target’s minimum deployment version is iOS 18, but its source references the new `ArrangementView` API, so an older SDK cannot compile it. Simulator builds need no signing team. Physical devices require your signing team and a reachable secured backend; this path has not been validated.

## Providers and finishing

| Setting | Purpose |
| --- | --- |
| `REACTOR_API_KEY` | Orbis live video and short-lived session tokens |
| `GEMINI_API_KEY` | Picture interpretation, lyrics, speech, live music, final song, and edit planning |
| `BLENDER_PATH` | Optional explicit Blender executable path |
| `FFPROBE_PATH` | Optional explicit native FFprobe binary path |
| `FFMPEG_PATH` | Optional override for the bundled FFmpeg binary |
| `REVENUECAT_PUBLIC_API_KEY` | Optional browser checkout SDK key |
| `REVENUECAT_SECRET_API_KEY` | Optional server-side entitlement verification key |

Install Blender 5.x and FFmpeg/FFprobe on the Mac. The demo renderer was tested with Blender 5.2. On Apple Silicon, prefer a native FFprobe install (`brew install ffmpeg`) or set `FFPROBE_PATH`; the npm package’s macOS payload may need Rosetta.

Model defaults are recorded in source. Account access varies. Advanced deployments can override `KRIYA_MUSIC_VISION_MODEL`, `KRIYA_MUSIC_LYRICS_MODEL`, `KRIYA_MUSIC_LIVE_MODEL`, `KRIYA_MUSIC_TTS_MODEL`, and `KRIYA_MUSIC_SONG_MODEL`. A different model must support the endpoint and output format that the code expects; changing a name alone is not a compatibility guarantee.

RevenueCat is optional locally. To explore checkout, create a product attached to the `music_video_pro` entitlement and a current offering in your own project, then supply its SDK and server credentials. No billing project or secret is bundled.

## Common problems

| Symptom | Try this |
| --- | --- |
| Xcode says the backend is missing | Run `cd studio && npm ci`; use this repository’s `MusicVideo.xcodeproj`. |
| The app cannot connect | Check the server address, `studio/.ios-runtime/server.log`, and whether port 3211 is occupied. |
| “From Mac” is unavailable | Launch through Xcode; it enables the simulator-only picker. Browser requests cannot invoke it. |
| Live generation cannot start | Confirm both provider keys and model access. Check your provider quota. |
| A drop is accepted but the picture is not visible yet | Acceptance acknowledges the direction. The model may take several moments or fail to depict the requested subject. |
| Finishing fails after recording | Check song-model access, FFprobe and Blender. Download the saved take before retrying. |
| A provider rejects a song request | Use original characters and original vocals; keep real-person references visual rather than requesting voice imitation. |
| A Mac import fails | Try Photos or Files. In Simulator, From Mac allows explicit selection without navigating the simulator filesystem. |

To move the server folder, set `DROPBEAT_STUDIO_ROOT` in the Xcode scheme. To choose another launch port, set `DROPBEAT_PORT` and use the same port in the app’s Advanced address.

## Checks

```bash
cd studio
npm test
npm run typecheck
npm run lint
npm run build
```

In Xcode, Product → Test runs the ordinary UI checks. `testLiveProduction` skips under the MusicVideo scheme. The MusicVideoLive scheme enables that paid provider test; it may run for several minutes. Native file-picker tests require a simulator with the app’s preloaded picture library.
