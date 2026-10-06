# SoundFlex Web Controller Implementation Plan

## Purpose

Create a SoundFlex-only web controller for MixBoard that closely reproduces the native `SoundFlexPanel` shown in `soundflex.png`. The application will use a React frontend and a local Node.js bridge because browsers cannot connect directly to MixBoard's raw TCP command and event ports.

The controller may run on a machine other than the MixBoard host. It must support current Edge, Firefox, and Chrome. A Windows launcher will start the application using the Node.js installation available in the test/development environment.

## Confirmed requirements

- React web interface with a Node.js backend.
- Editable MixBoard host, command port, and event port, persisted locally.
- No authentication in the current scope.
- Reproduce all controls visible in the reference GUI.
- Discover VideoInputs and the supported input count through `MBC_GETVIDEOINPUTLIST`.
- Preserve native SoundFlex state semantics:
  - selected output channel affects input audio enable, AFV, per-channel strip volume, routing status, and displayed input metering;
  - solo and T0-T3 input assignments are global per VideoInput;
  - output T0-T3 volume controls are global, while their meters reflect the selected output channel;
  - preview monitor channel, track, volume, and global solo indication reflect MixBoard state.
- Adapt the layout for smaller screens while retaining the desktop two-row mixer presentation where space permits.
- Reuse approved ClassX/SoundFlex branding and source icons.
- Display the per-input audio-settings button, but leave it disabled/nonfunctional for this implementation.
- Add the MBControl functionality required by the native per-channel input-strip fader.
- Fix the current per-input RMS response defect.

## Explicit exclusions

- Implementing the advanced VideoInput audio-settings editor.
- Authentication, TLS termination, internet-facing deployment, or multi-user authorization.
- Video switching, transitions, keyers, or non-SoundFlex MixBoard controls.
- Changing existing audio semantics or redesigning the native SoundFlex GUI.
- Bundling a portable Node.js runtime in the first implementation. The launcher may use the installed Node.js runtime confirmed for testing.
- Fixing unrelated MBControl defects, including `MBC_SETAUDIOMASTERVOLUME`, unless separately approved.

## Existing architecture and authoritative behavior

### Native GUI

The native implementation is primarily:

- `ClassX Library/it/classx/audio/soundflex/SoundFlexPanel.java`
- `ClassX Library/it/classx/audio/gui/TrackMapInfoControllerPanel.java`
- `ClassX Library/it/classx/audio/gui/OutputTrackVolumeControlPanel.java`
- `ClassX Library/it/classx/audio/gui/AudioVolumeEditorPanel.java`
- `ClassX Library/it/classx/audio/gui/AudioPreviewIndicatorPanel.java`
- `ClassX Library/it/classx/audio/gui/ChannelSelectionIndicatorPanel.java`

The native input-strip fader calls `TrackMapInfo.setMasterVolumePerChannel(CHANNEL, volume)`. It is not equivalent to either existing command below:

- `MBC_SETAUDIOTRACKVOLUME` changes a global T0-T3 output-track fader.
- `MBC_SETVIDEOINPUTCHANNELVOLUME` changes one source audio channel indexed 0-7.

### MBControl

Relevant sources:

- `mixboard/engine/MBControl.java`
- `mixboard/engine/MBControlRemoteCommandParser.java`
- `MBControl_Guide.md`
- `ClassX Library/it/classx/audio/TrackMapInfo.java`

The web controller will use:

- `MBC_GETVIDEOINPUTLIST`
- `MBC_GETSOUNDFLEXINFO`
- `MBC_GETMIXBOARDINFO` for CH_0 through CH_3
- `MBC_GETVIDEOINPUTRMS`
- `MBC_GETAUDIOTRACKRMS`
- `MBC_SELECTCHANNEL`
- `MBC_SETAUDIOPREVIEWCHANNEL`
- `MBC_SETAUDIOPREVIEWTRACK`
- `MBC_SETAUDIOPREVIEWVOLUME`
- `MBC_SETAUDIOTRACKVOLUME`
- `MBC_SETAUDIOENABLED`
- `MBC_SETAUDIOFOLLOWVIDEO`
- `MBC_SETAUDIOTRACKENABLED`
- `MBC_SETAUDIOSOLOPREVIEW`
- the new per-output-channel VideoInput master-volume command defined below.

Command TCP defaults to port 701, event TCP defaults to port 801, and both are configurable.

## Target architecture

### MBControl protocol extension

Add:

```text
MBC_SETAUDIOMASTERVOLUMEPERCHANNEL \
  CHANNEL=<CH_0|CH_1|CH_2|CH_3> \
  VIDEOINPUTID=<integer> \
  VOLUME=<float>
```

The command will:

1. validate `VIDEOINPUTID` using the same bounds as the other VideoInput audio setters;
2. parse `CHANNEL` using the established MBC channel behavior;
3. pass the value to `TrackMapInfo.setMasterVolumePerChannel(channel, volume)`;
4. return `Ok` or `Error 4` consistently with neighboring setters;
5. retain the existing convention of passing the float through without introducing a new clamp;
6. be documented in `MBControl_Guide.md` from the executable implementation.

No new event schema is planned. The controller will reconcile state through snapshots because the existing `AUDIO_VOLUME_CHANGED` event does not identify the affected output channel.

Fix `MBC_GETVIDEOINPUTRMS` by allocating a distinct JSON inner array for each VideoInput instead of clearing and reusing one shared array. Preserve the existing outer/inner ordering and Base64-encoded JSON format.

### Node.js bridge

The backend will:

- bind its HTTP/WebSocket server to loopback by default;
- serve the built React application;
- maintain one serialized TCP command connection and one continuously drained event connection to the configured MixBoard host;
- consume the optional welcome line and LF-framed replies;
- ignore event-port `PING` heartbeats;
- decode only documented Base64 JSON results;
- serialize commands so replies remain correlated by send order;
- reconnect with bounded backoff and perform a complete snapshot after reconnect;
- expose a narrow typed WebSocket API rather than unrestricted MBControl command forwarding;
- validate channels, tracks, IDs, Booleans, and nominal volume ranges before command construction;
- coalesce obsolete fader changes and meter requests;
- report connection and command errors to the frontend.

### React frontend

The frontend will maintain server-confirmed state and render:

- title/branding header;
- preview monitor volume knob;
- preview T0-T3 selection and solo indicator;
- CH0-CH3 selector;
- four T0-T3 output strips with faders and stereo meters;
- a dynamic set of VideoInput strips with native-like status colors, audio enable, per-selected-channel fader, stereo meter, AFV, solo, disabled settings button, and T0-T3 assignment toggles;
- connection settings and connection/error status without displacing the mixer during normal operation.

The desktop layout will target the reference image. Smaller viewports will use scrolling and responsive strip sizing rather than removing controls.

### State synchronization

1. Connect the event stream before taking snapshots where practical.
2. Query the VideoInput list, SoundFlex state, and four MixBoard channel states.
3. Reconcile program/preview status from MixBoard events and channel snapshots.
4. Apply audio events where their payload is unambiguous.
5. Re-snapshot SoundFlex state periodically and after relevant ambiguous events or successful mutations.
6. Poll input and selected-channel output RMS at a bounded meter rate, initially matching the native 100 ms repaint cadence if the live server sustains it.
7. Rebuild all state after either protocol connection is lost.

## Expected files

### MixBoard project

Modify:

- `mixboard/engine/MBControl.java`
- `mixboard/engine/MBControlRemoteCommandParser.java`
- `MBControl_Guide.md`

Potentially create a focused test under `mixboard/engine/test/` only if it can run reliably with the existing project infrastructure. Do not introduce a new test framework solely for this change.

### SoundFlexControl project

Expected new files/directories include:

- `package.json`
- package lock file
- `vite.config.*`
- `index.html`
- `src/` React application, typed protocol/state helpers, components, styles, and tests
- `server/` Node TCP/WebSocket bridge, parsers, state coordinator, and tests
- `public/` approved ClassX/SoundFlex assets
- `launcher/` or root Windows launcher scripts
- `README.md`
- `.gitignore` appropriate for generated Node artifacts (without initializing Git)

Exact file subdivision will be chosen during the relevant task and kept proportionate to the implementation.

## Implementation tasks

### Task 1 — MBControl protocol support

**Objective:** Make the server expose the exact mutation and valid per-input RMS data required by the web mixer.

Work:

- add `MBC_SETAUDIOMASTERVOLUMEPERCHANNEL` to the command enum and parser dispatch;
- implement the corresponding `MBControl` method with established validation/locking/result patterns;
- correct `getVideoInputRMS()` inner-array ownership;
- update `MBControl_Guide.md`, including command, state/metering behavior, removal of the RMS defect warning, and validation notes;
- format all modified Java files with the required ClassX formatter;
- compile with the ClassX custom JDK and review impact on command discovery and existing clients;
- perform a focused protocol validation where the runtime permits it.

**Exit criterion:** The new command is discoverable and dispatches to the correct per-channel field; RMS JSON has independent entries; documentation matches executable behavior; formatting and compilation pass.

### Task 2 — Web project foundation and protocol bridge

**Objective:** Establish a testable React/Node project and reliable constrained bridge to MixBoard.

Work:

- scaffold React with Vite and the Node server in `SoundFlexControl`;
- define frontend/backend message schemas;
- implement LF-framed command serialization, optional welcome handling, timeout/error handling, event reading, reconnect behavior, and Base64 JSON decoding;
- implement persisted host/port settings;
- expose only required SoundFlex actions;
- add parser and command-queue tests using local mock TCP servers;
- document development commands.

**Exit criterion:** A browser can configure a mock/real MixBoard endpoint, connect through the backend, receive a complete typed snapshot, send each supported action, and recover from simulated disconnects; automated bridge tests pass.

### Task 3 — State coordination and live metering

**Objective:** Keep controller state accurate under snapshots, events, mutations, and reconnects.

Work:

- implement initial snapshot sequencing;
- parse relevant `MIXBOARDEVENT`, `VIDEOINPUTEVENT`, and `AUDIOEVENT` records;
- implement periodic reconciliation for fields not safely identifiable from events;
- implement bounded RMS polling for inputs and output tracks;
- coalesce fader updates and suppress stale responses;
- add state-reducer/coordinator tests.

**Exit criterion:** Program/preview colors, selected channel, audio states, faders, tracks, solo state, and meters converge to server state after actions, external changes, and reconnects without unbounded command queues.

### Task 4 — Native-like React GUI

**Objective:** Reproduce the visible SoundFlex interface and interaction semantics.

Work:

- inspect and reuse approved source SVG assets;
- implement header, preview monitor controls, channel selector, output strips, and dynamic VideoInput strips;
- reproduce dark styling, spacing, status colors, vertical faders, stereo VU meters, labels, button states, and disabled settings buttons;
- preserve native action semantics and accessible keyboard/pointer operation;
- add responsive behavior for smaller screens;
- add focused component tests and compare against `soundflex.png` at desktop and reduced viewport sizes.

**Exit criterion:** All agreed visible controls are present, connected to the correct state/actions, and visually match the reference closely at desktop size while remaining usable at smaller sizes.

### Task 5 — Launcher, browser validation, and handoff

**Objective:** Make the controller straightforward to start and validate as a complete application.

Work:

- add a Windows launcher that checks for Node.js, installs dependencies only when explicitly requested/appropriate, starts the production server, waits for readiness, and opens the local URL in the default browser;
- provide clear errors when Node.js or required build artifacts are absent;
- document build, launch, configuration, and troubleshooting;
- validate current Edge, Firefox, and Chrome;
- run frontend/backend tests and production build;
- perform a live MixBoard smoke test if a reachable instance is available;
- review generated files and final changes for unrelated content.

**Exit criterion:** The launcher starts the built application with the installed Node.js runtime, the three target browsers work, documented tests/build pass, and the controller completes the required live workflow.

### Task 6 — Minimize RMS VU-meter protocol traffic

**Objective:** Preserve responsive RMS VU meters while reducing command frequency and data exchanged with MixBoard.

Work:

- measure and document the current RMS query rate, response volume, and behavior under slow replies;
- use one shared backend meter stream for all browser clients and fan out cached samples instead of polling once per client;
- poll only while at least one connected client actively needs meter data, pausing when there are no viewers and supporting suspension for hidden/inactive pages;
- avoid duplicate, overlapping, or obsolete RMS requests and retain strict backpressure when MixBoard replies slowly;
- evaluate a lower or adaptive polling frequency that remains visually responsive, with separate rates where useful for visible and inactive states;
- avoid sending unchanged or superseded meter samples to browsers where doing so provides no visible benefit;
- add focused tests for subscription lifecycle, multiple clients, backpressure, reconnects, and query-rate limits;
- document the chosen meter cadence and validate it against a live MixBoard when one is available.

**Exit criterion:** Meter polling is demand-driven and shared, never accumulates an unbounded query queue, substantially reduces idle and redundant MixBoard traffic, and keeps visible meters acceptably responsive with automated query-rate/backpressure coverage.

### Task 7 — Fit and proportion the GUI to the browser viewport

**Objective:** Make the complete SoundFlex web GUI fit within the available browser area while closely preserving the proportions, relative control sizes, spacing, and overall composition shown in `soundflex.png`.

Work:

- measure the reference image's major regions, strip dimensions, gaps, controls, typography, and width/height ratios rather than approximating each area independently;
- define a reference layout coordinate system and scale the mixer coherently to the browser's available width and height at 100% browser zoom;
- account for the application header and connection/error overlays without allowing them to permanently displace or clip the mixer;
- keep all mixer sections and controls visible without browser-page horizontal or vertical scrolling at the supported desktop and laptop viewport sizes;
- preserve the reference two-row strip composition and relative sizing wherever the viewport permits, using proportional fallback rules for narrower or differently shaped browser areas;
- ensure dynamically discovered VideoInputs fit predictably up to the supported input count without distorting individual control groups;
- retain usable pointer targets, readable labels, keyboard focus indicators, and correct meter/fader interaction after scaling;
- add viewport layout tests that assert the mixer stays inside the visible browser bounds and that key reference proportions remain within agreed tolerances;
- compare screenshots with `soundflex.png` at 3840×2160 and representative 1920×1080, 1366×768, 1280×720, and reduced browser areas in Edge and Firefox where available.

**Exit criterion:** At 100% browser zoom, the complete mixer fits inside each agreed test viewport without page-level scrolling or clipped controls, and measured section/control proportions closely match `soundflex.png` while all controls remain usable.

### Task 8 — Independent output channel per browser window

**Objective:** Allow concurrent SoundFlex windows to control and meter different output channels without changing another window's selected channel or MixBoard's global preview-monitor channel.

Requested behavior:

- URLs `/?channel=CH_0` through `/?channel=CH_3` choose each window's initial local channel. Missing/invalid values default to `CH_0` without sending MBControl mutations.
- Ctrl-click changes only that window's local channel and updates its URL with `history.replaceState`, preserving other URL parameters. Refresh restores that channel. Do not persist the selection in shared `localStorage`.
- Local selection is independent of `soundFlex.CURRENT_CHANNEL` and native `SELECT_CHANNEL` / preview-channel events. These server fields remain authoritative global state, not a window selection.
- Input enable, AFV, per-channel input gain, program/preview colors and output meters use the window's local channel. Input meters retain the existing track/solo selection and apply the local channel's input-strip gain.
- T0–T3 output gains, input track assignments and solo, preview track/volume, backend connection settings and connect/disconnect remain shared. Preview listening remains on the global monitor channel set in MixBoard; identify it in the preview control tooltip/accessibility description. Merely opening a window or Ctrl-clicking must not change it.

Work:

1. Add typed local channel state in `App.tsx`, URL parsing/updating and explicit channel/selection props in `Mixer.tsx`. Stop sending the existing global `selectChannel` action from channel buttons; remove that obsolete public web action and its command construction rather than leave an unused global switch path.
2. Include `{ active, channel }` in meter subscriptions. Track the subscribed channel per WebSocket and validate both fields. On channel change clear old displayed meters; cached/new samples must match the current local channel before acceptance.
3. Replace single-channel meter demand/cache with a distinct active-channel set and per-channel cached samples in the shared bridge. Maintain one serialized meter cycle: query `MBC_GETVIDEOINPUTRMS` once, then `MBC_GETAUDIOTRACKRMS` once for each distinct active channel. Fan out each channel sample only to its matching viewers, never duplicate polls per window.
4. Preserve the 150 ms post-response cadence, strict one-cycle backpressure, snapshot/action priority, hidden-page suspension, unchanged-sample suppression and reconnect rebuilding. With N distinct visible channels the cycle contains 1+N queries (maximum five); with no visible clients there are none. Stop delivering old-channel samples when a subscription changes during a cycle, and clear caches on disconnect/reconnect.
5. Add URL/default/local-selection tests, scoped control-action assertions and two-window UI coverage demonstrating that global native state changes do not move local selection. Extend bridge/WebSocket tests for same-channel sharing, different-channel fan-out, input RMS query reuse, channel switches during slow reads, cached samples, invalid subscriptions, visibility and reconnect.
6. Run typecheck, frontend/backend tests, production build and the viewport runner. Review concurrent windows in Edge/Firefox where available; validate against live MixBoard when endpoint details are supplied. Update README and shared style guide with per-window URLs, shared-state boundaries and preview-listening semantics.

Expected files: `src/App.tsx`, `src/api.ts`, `src/types.ts`, `src/components/Mixer.tsx`, focused frontend helpers/tests, `server/web-server.js`, `server/mixboard-bridge.js`, `server/snapshot.js`, `server/actions.js`, affected backend tests, `src/test/viewport.tsx`, `README.md`, `../STYLEGUIDE.md`, this plan and status. No new dependencies, extra backend instances, launcher changes or MixBoard Java changes are required.

**Exit criterion:** Two or more windows retain independent selected channels through Ctrl-click, state events and reload; scoped controls send their own channel; output meters arrive only for each subscribed channel; global preview selection is untouched by local navigation; shared input RMS polling and per-distinct-channel output polling remain bounded with automated multi-window/backpressure coverage; tests, layout checks and build pass.

**Approved architectural change:** Earlier tasks coupled web selection to the native/global monitor channel and one output-meter stream. Task 8 deliberately separates local navigation from global monitor state and adds channel-scoped shared meter subscriptions. The user explicitly approved this updated plan before implementation.

## Validation strategy

### Java/protocol

- Required Eclipse Java formatter on every modified `.java` file.
- Compilation using `C:\ClassX\DEV\Java\v8\jre\jvm64\bin\javac.exe` with Eclipse project dependencies and `C:\ClassX\DEV\Java\v8\jre\lib\ext\*`.
- Verify `HELP`/command enum/parser/method consistency.
- Decode RMS Base64 and assert distinct input arrays remain distinct.
- Set and query `MASTER_VOLUME_PER_CHANNEL` for more than one CH value without altering `MASTER_VOLUME` or `CHANNEL_VOLUME`.
- Verify `MBControl_Guide.md` command coverage and remove only defect text actually fixed.

### Node/backend

- Unit tests for line framing, welcome handling, Base64 JSON, event parsing, command serialization, timeouts, and validation.
- Integration tests with mock command/event TCP servers.
- Reconnect and full-state rebuild tests.
- Meter-poll backpressure/coalescing tests.

### React/UI

- Component/action tests for each control group.
- State updates from snapshots/events and rollback/error presentation.
- Responsive checks at reference desktop dimensions and representative laptop/tablet widths.
- Automated viewport-bound and reference-proportion assertions at the Task 7 target resolutions.
- Manual visual comparison with `soundflex.png`.

### End to end

- Configure a remote MixBoard host and persist settings.
- Select CH0-CH3 and verify native-equivalent state changes.
- Adjust output-track and per-input/per-channel faders.
- Toggle enable, AFV, solo, and T0-T3 mapping.
- Select preview track and volume.
- Observe program/preview colors and both meter groups.
- Disconnect/restart MixBoard and verify recovery.

## Cleanup and persistence

- Do not commit `node_modules`, transient logs, local settings, or generated temporary test artifacts.
- Persist connection settings in browser-local storage; do not store credentials because authentication is excluded.
- Ensure TCP sockets, timers, and WebSocket clients close on backend shutdown.
- Keep build output reproducible and documented.
- Do not modify CVS metadata or commit to CVS.

## Acceptance criteria

- The application runs as a React UI through a local Node.js bridge and can target a MixBoard on another machine.
- Connection host and ports are editable and persisted.
- All agreed visible native SoundFlex controls are represented; the settings button is visibly disabled/nonfunctional.
- Controls operate on the exact native state dimensions described above.
- VideoInputs and supported count are discovered dynamically.
- Input RMS values correspond to their actual VideoInputs after the server fix.
- UI state recovers from external changes and connection loss.
- Desktop appearance closely follows `soundflex.png`; the complete GUI fits the available browser area without page-level scrolling or clipping and preserves the reference proportions across the agreed viewport sizes.
- Edge, Firefox, and Chrome are supported.
- A Windows launcher and operating documentation are provided.
- Java formatting/compilation and web tests/build pass.

## Risks and decisions for review

- **Command name:** this plan proposes `MBC_SETAUDIOMASTERVOLUMEPERCHANNEL`. Approval of this plan approves that wire name unless changed during review.
- **Event ambiguity:** no event protocol extension is proposed; snapshots will reconcile per-channel volume and similarly ambiguous state.
- **Meter load:** 100 ms polling matches the native repaint cadence but must be reduced if live TCP payload/latency testing shows sustained backpressure.
- **Visual fidelity:** Java Swing rendering cannot be pixel-identical across browser engines; acceptance is close structural and visual fidelity with equivalent interaction.
- **Launcher runtime:** the current plan uses the installed Node.js runtime confirmed for testing. Shipping a bundled portable runtime is deferred unless later requested.
- **Live validation dependency:** final hardware/live validation requires an accessible running MixBoard instance with MBControl enabled.
