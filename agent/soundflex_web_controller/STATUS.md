# SoundFlex Web Controller Status

## Overall status

`READY_FOR_REVIEW`

Tasks 0–6 are complete and approved. Tasks 7 and 8 are ready for review. Task 8 supports independent local channels per browser window with channel-scoped shared meters. Live MixBoard validation awaits connection details.

## Current task

### Task 8 — Independent output channel per browser window

- **State:** `READY_FOR_REVIEW`
- **Objective:** Give each browser window a local channel selected by URL and Ctrl-click, with correctly scoped controls/meters and unchanged global preview monitoring.
- **Exit criterion:** Concurrent windows retain independent channels through clicks, native events and reload; channel-scoped controls and meter fan-out are correct; demand-driven polling is shared and bounded; tests, layout checks and build pass.

## Next task

Human review of Task 8. Live MixBoard validation can follow once the host/IP and command/event ports are supplied; no subsequent implementation task is planned.

## Task checklist

| Task | Description | State |
|---|---|---|
| 0 | Planning | `APPROVED` |
| 1 | MBControl protocol support | `APPROVED` |
| 2 | Web project foundation and protocol bridge | `APPROVED` |
| 3 | State coordination and live metering | `APPROVED` |
| 4 | Native-like React GUI | `APPROVED` |
| 5 | Launcher, browser validation, and handoff | `APPROVED` |
| 6 | Minimize RMS VU-meter protocol traffic | `APPROVED` |
| 7 | Fit and proportion the GUI to the browser viewport | `READY_FOR_REVIEW` |
| 8 | Independent output channel per browser window | `READY_FOR_REVIEW` |

## Approved tasks

- Task 0 — Planning
- Task 1 — MBControl protocol support
- Task 2 — Web project foundation and protocol bridge
- Task 3 — State coordination and live metering
- Task 4 — Native-like React GUI
- Task 5 — Launcher, browser validation, and handoff
- Task 6 — Minimize RMS VU-meter protocol traffic

## Tasks awaiting review

- Task 7 — Fit and proportion the GUI to the browser viewport

- Task 8 — Independent output channel per browser window

## Blockers

- Live validation awaits the user's running MixBoard host/IP and command/event ports.
- Chrome is not installed on this workstation. Current Edge and Firefox validation passed; Chrome runtime checks could not be performed.

## Deferred work

- Advanced VideoInput audio-settings editor.
- Authentication and TLS.
- Bundled/portable Node.js runtime.
- Unrelated MBControl defects, including the existing `MBC_SETAUDIOMASTERVOLUME` parser mismatch.

## Human review decisions recorded

- The implementation plan and proposed `MBC_SETAUDIOMASTERVOLUMEPERCHANNEL` command name were approved.
- Task 1 was approved and Task 2 was authorized to start.
- Task 2 was approved and Task 3 was authorized to start.
- Task 3 was approved and Task 4 was authorized to start.
- Task 4 was authorized after explicit approval of Task 3.
- Task 4 was approved and Task 5 was authorized to start.
- Task 5 and the completed implementation were approved.
- Task 6 and the RMS traffic optimization implementation were approved.
- Task 7 was requested to make the GUI fit the browser area and reflect the proportions and sizes of `soundflex.png`.
- Task 7 implementation was authorized; the user offered to run MixBoard.
- Review feedback requested native-like slider tick alignment; the clipboard image was not attached to the conversation.
- The user acknowledged the tick correction and requested that output-channel buttons change channel only on Ctrl-click.
- The user requested independent channels in simultaneous windows and accepted the proposed URL/local-selection approach; Task 8's detailed plan was prepared before changing the previously approved global-selection/meter architecture.
- The user explicitly approved Task 8's detailed plan and authorized implementation.

- Use a Node.js backend and React frontend.
- Allow operation from a controller machine separate from MixBoard.
- Make host and command/event ports editable and persistent.
- No authentication in the current scope.
- Reproduce all visible controls from the reference GUI.
- Preserve exact native state semantics.
- Discover VideoInputs dynamically and support smaller screens.
- Reuse ClassX/SoundFlex branding and assets.
- Show but do not implement the audio-settings button.
- Modify MBControl to support the native per-channel input-strip fader and correct RMS data.
- Add a Windows launcher and support Edge, Firefox, and Chrome.
- Node.js is installed in the current test environment, so initial launcher testing may use it.

## Validation history

- Inspected `soundflex.png` (3840×2160 reference).
- Inspected `MBControl_Guide.md`.
- Traced relevant parser cases in `MBControlRemoteCommandParser.processCommandImpl(...)`.
- Verified `MBC_SETAUDIOTRACKVOLUME` changes `OutputTrackMap` T0-T3 volume.
- Verified `MBC_SETVIDEOINPUTCHANNELVOLUME` changes source audio channel 0-7 volume.
- Verified the native strip fader changes `TrackMapInfo.masterVolumePerChannel` for the selected output channel.
- Verified `MBC_GETVIDEOINPUTRMS` currently reuses one `JSONArray` for every outer entry.
- Confirmed Windows Node.js version `v24.18.0` is installed. The harness could not run npm successfully through WSL redirection; this is an environment observation, not an application failure.
- Added `MBC_SETAUDIOMASTERVOLUMEPERCHANNEL` with syntax `CHANNEL/k/r,VIDEOINPUTID/k/r,VOLUME/k/r` and traced parser dispatch to `TrackMapInfo.setMasterVolumePerChannel(...)`.
- Updated the reported MBControl protocol version to `1.1 (29/09/2026)`.
- Corrected `MBC_GETVIDEOINPUTRMS` to allocate one JSON inner array per VideoInput.
- Ran the required Eclipse Java formatter successfully on both modified Java files.
- Compiled both modified Java files successfully with the ClassX custom JDK and required project/runtime classpaths.
- Verified all 33 `MBREMOTE_COMMANDS` entries have parser cases and guide references.
- Verified Markdown fence balance and confirmed the obsolete shared-array defect text is absent.
- Inspected the generated bytecode and confirmed the new enum member and public MBControl method are present.
- Removed temporary formatter configuration and compilation output.
- Scaffolded the React/Vite frontend and loopback Node.js/Express/WebSocket backend.
- Installed dependencies and generated `package-lock.json`; npm reported zero vulnerabilities.
- Implemented LF/CRLF framing, optional standard welcome handling, serialized commands, command/connect timeouts, event draining, `PING` suppression, bounded reconnect, and full snapshot rebuilding.
- Implemented standard-Base64 JSON decoding with optional padding.
- Added strict settings and SoundFlex action validation; no unrestricted MBControl forwarding is exposed.
- Added browser-local persistence for MixBoard host and ports.
- Added typed frontend snapshot/action contracts and a connection/snapshot foundation UI.
- Added mock command/event integration tests covering all actions, welcome handling, queue order, timeout, events, snapshots, WebSocket requests, and reconnect.
- TypeScript type checking passed.
- All 8 Node tests passed.
- Vite production build passed.
- Production server smoke test passed for `/api/health` and the built page.
- Removed generated logs, temporary validation scripts, and build output; `node_modules` remains local and is ignored.
- Added parsing and state reduction for relevant `MIXBOARDEVENT`, `VIDEOINPUTEVENT`, and `AUDIOEVENT` records, including quoted values.
- Applied unambiguous event changes immediately and debounced SoundFlex/full reconciliation for ambiguous events.
- Preserved events received during in-flight snapshots so later snapshot responses cannot overwrite newer event state.
- Added five-second complete-state reconciliation and full rebuild after reconnect.
- Added 100 ms input/output RMS polling with one in-flight cycle, selected-channel stale-response suppression, and monotonic meter sequences.
- Added per-control fader coalescing that replaces obsolete unsent updates and cancels pending updates on disconnect.
- Reconciled server state after successful mutations.
- Added typed `state` and `meters` WebSocket messages and frontend stale-meter suppression.
- Added event reducer, snapshot/event ordering, mutation reconciliation, fader coalescing, meter backpressure, and WebSocket broadcast coverage.
- TypeScript type checking passed.
- All 12 Node tests passed.
- Vite production build passed.
- Removed generated validation logs/scripts and build output.
- Copied the approved SoundFlex, audio, solo, AFV, track, channel, and settings SVG assets from ClassX Library.
- Replaced the foundation screen with the native-like SoundFlex mixer, connection overlay, status indicator, and error toast.
- Added preview volume/track controls, solo indication, CH0–CH3 selection, four output strips, and dynamic VideoInput strips.
- Connected audio enable, AFV, solo, track assignment, preview, channel, and fader interactions to the scoped API actions.
- Added native-equivalent dB fader conversion, stereo meter rendering, program/preview colors, selected-channel semantics, and local input meter-track selection.
- Kept the audio-settings control visible and disabled.
- Added two-row desktop ordering matching the native panel plus horizontal/single-row responsive layouts for small or short viewports.
- Added keyboard focus styling, labels, pressed states, and meter accessibility metadata.
- Added Vitest, jsdom, and Testing Library UI validation.
- All 12 backend tests and 5 UI tests passed.
- TypeScript type checking and the Vite production build passed.
- Compared fixture renders against `soundflex.png` in Edge at 1920×1080 and 900×700; the expected desktop and reduced layouts rendered correctly.
- npm reported zero vulnerabilities after adding UI test dependencies.
- Removed temporary fixture pages, screenshots, logs, validation scripts, and build output.
- Added an explicit Windows setup script using the lock file and production build.
- Added a Windows start script that checks Node.js, dependencies, build output, and launcher support files before starting the server.
- Added bounded readiness polling and default-browser opening, with a documented unattended-browser suppression option.
- Verified the launcher serves `/api/health` and the built application on an alternate test port.
- Verified the launcher reports a clear error and nonzero exit when build output is absent.
- Expanded the README with quick-start, manual build, remote MixBoard configuration, browser status, and troubleshooting guidance.
- Re-ran TypeScript type checking successfully.
- Re-ran all 12 backend tests and 5 frontend tests successfully.
- Rebuilt the Vite production application successfully.
- Ran the built application in the installed current Microsoft Edge and confirmed the React UI rendered in the DOM without a browser process failure.
- During Task 5, Chrome and Firefox were not found in the checked standard or registered paths, so those runtime checks were not performed at that time.
- A live MixBoard instance was not available; mock integration coverage remains the executable protocol validation.
- Removed generated logs, validation helpers, browser captures, and build output after validation.
- Added a dedicated local-network launcher that binds the web server to all interfaces while opening the loopback URL locally.
- Confirmed the running server listens on `0.0.0.0:3080` and responds through Ethernet address `192.168.1.10`.
- Confirmed Windows Firewall has enabled inbound Node.js rules restricted to the Private profile.
- Replaced continuous 100 ms RMS polling with one shared demand-driven backend stream using a 150 ms post-response cadence.
- Added browser visibility subscriptions so hidden pages suspend demand and polling stops with no active viewers.
- Preserved strict one-cycle backpressure, cached the latest sample for new subscribers, and suppressed unchanged meter broadcasts.
- Added tests for idle/active subscription lifecycle, multiple browser clients, scoped fan-out, cached delivery, slow-reply backpressure, reconnects, unchanged samples, and query-rate limits.
- All 13 backend tests and 5 frontend tests passed; TypeScript type checking and the Vite production build passed.
- Launched the production application in Firefox from `C:\Program Files (x86)\Mozilla Firefox\firefox.exe` at 1280×800 and confirmed the rendered connection UI.
- A live MixBoard instance was unavailable, so production RMS payload size and visual meter cadence could not be measured against hardware.

### Task 7 validation

- Recorded reference-region measurements and browser-specific exceptions in `ext_docs/VIEWPORT_REFERENCE.md`.
- Introduced one width/height-constrained reference unit for major control sizing, with laptop readability floors.
- Scaled fader thumbs and native input hit areas together; capped input meter/fader/control-column widths to avoid inflated controls with fewer inputs.
- Added a dependency-free Windows Edge DOM-bound runner and a deterministic React mixer fixture. Firefox screenshots are visual checks, not automated bounds assertions.
- All 18 Edge viewport checks passed: 3840×2160, 1920×1080, 1366×768, 1280×720, 1024×600 and 900×700, each with 2, 16 and 24 inputs.
- Captured Edge and Firefox fixtures at all six resolutions; inspected reference-size, laptop and reduced-area captures against `soundflex.png`. Complete lower-row visibility intentionally replaces the reference image's taskbar clipping.
- TypeScript checking passed; all 22 backend tests and 20 UI/layout-budget tests passed; Vite production build passed.
- `git diff --check` passed. Temporary logs, stdin file and captures were removed; the ignored production build is retained for user testing.
- No live MixBoard validation was performed yet. The user offered to run it; host/IP and ports remain pending. Chrome is still unavailable.

### Fader alignment review correction

- Inspected Java `AudioVolumeEditorPanel`: major ticks every 10 dB and minor ticks every 2 dB.
- Replaced full-height flex-distributed labels with dB-positioned tick centers over the actual thumb-center travel. Both browser thumb styles now use explicit border-box dimensions.
- Added the missing 2 dB minor ticks, a component tick-position test and real-browser geometric alignment assertions for every fader/tick at all 18 fixture combinations.
- TypeScript checking, 21 frontend tests, 18 Edge layout/alignment checks and production build passed. Re-captured Edge/Firefox fixtures and inspected laptop tick alignment; clipboard image itself remains unavailable.

### Channel selection review correction

- Channel buttons now send `selectChannel` only when the click event has Ctrl pressed. Normal, Shift-only, Alt-only and Meta-only clicks leave selection unchanged.
- Added a Ctrl-click tooltip, interaction regression coverage and application-specific documentation.
- TypeScript checking, all 22 frontend tests and the production build passed.

### Task 8 validation

- Added local URL channel state (CH_0 default, invalid values rejected), Ctrl-click navigation and URL persistence without shared localStorage or global MBControl selection commands.
- Separated local strip/action/meter channel from global `CURRENT_CHANNEL`; the preview knob tooltip and accessibility description identify the global listening channel.
- Removed the global web `selectChannel` action. Preview, track gains, solo/assignments and backend connection remain shared as documented.
- Meter subscriptions carry validated activity/channel fields. One backend cycle queries shared input RMS once and output RMS once per distinct visible channel, with per-channel caches, fan-out and unchanged-sample suppression.
- Added URL, API subscription and two-App tests for independent channels, native state changes, scoped controls, wrong-channel meter suppression and clearing on navigation.
- Added backend tests for multi-channel demand, duplicate viewers, all-four-channel five-query bounds, slow-cycle backpressure, subscription changes, cache delivery, invalid subscriptions and independent suspension/disconnection. Existing reconnect and native GUI synchronization regressions still pass.
- TypeScript checking passed; all 33 frontend tests and 24 backend tests passed; all 18 Edge layout/alignment checks passed; production build passed.
- With a temporary mock shared bridge, validated two concurrent production Edge pages: CH_0 and CH_2 restore from their URLs, and Ctrl-click on the first page changes only that page to CH_1. Captured and reviewed the production CH_0/CH_2 Edge layouts.
- Firefox launched the production pages but CLI screenshot capture preceded the WebSocket snapshot; this does not establish Firefox concurrent-channel validation. Prior Firefox mixer fixture/layout validation remains applicable; live/multi-window Firefox checks remain manual deployment validation.
- No live MixBoard instance was contacted because endpoint details were not supplied. No MixBoard Java source, dependencies or launchers were changed.
- Temporary browser review helper, profiles, logs, stdin file and captures were removed; ignored production build remains available for user testing.

## Files changed by Task 8

- `src/App.tsx`, `src/App.test.tsx`
- `src/channel.ts`, `src/channel.test.ts`
- `src/api.ts`, `src/api.test.ts`, `src/types.ts`
- `src/components/Mixer.tsx`, `src/components/Mixer.test.tsx`
- `src/components/PreviewKnob.tsx`
- `src/test/viewport.tsx`
- `server/actions.js`, `server/snapshot.js`, `server/mixboard-bridge.js`, `server/web-server.js`
- `server/test/actions.test.js`, `server/test/mixboard-bridge.test.js`, `server/test/web-server.test.js`
- `README.md`, `../STYLEGUIDE.md`
- `agent/soundflex_web_controller/PLAN.md`, `agent/soundflex_web_controller/STATUS.md`

Prior uncommitted Task 7 changes are retained.

## Files changed by Task 7

- `src/styles.css`
- `src/components/Fader.tsx`
- `src/components/Fader.test.tsx`
- `src/components/Mixer.tsx`
- `src/components/Mixer.test.tsx`
- `src/layout.test.ts`
- `src/test/viewport.html`
- `src/test/viewport.tsx`
- `src/test/viewport-browser.mjs`
- `package.json`
- `README.md`
- `../STYLEGUIDE.md`
- `agent/soundflex_web_controller/ext_docs/VIEWPORT_REFERENCE.md`
- `agent/soundflex_web_controller/STATUS.md`

No MixBoard source was changed.
