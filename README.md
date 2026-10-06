# SoundFlex Control

SoundFlex Control is a React web controller backed by a local Node.js bridge to MixBoard's MBControl TCP command and event services.

The responsive interface follows the native SoundFlex mixer: preview monitor controls, channel selection, four output tracks, and dynamically discovered VideoInput strips with routing, solo, AFV, faders, and live stereo metering.

## Requirements

- A current Node.js installation available in `PATH`. Node.js 24 is used by the current development environment.
- A MixBoard build exposing MBControl protocol 1.1 and `MBC_UPDATESOUNDFLEXGUI` for native GUI synchronization.
- Network access from this machine to MixBoard's command and event ports.
- A current Edge, Firefox, or Chrome browser.

## Windows desktop installer — ClassX SoundFlexControl

On a **Windows x64 build machine** with a current Node.js LTS installation (Node.js 24.18 or newer recommended) and internet access:

1. Double-click `Build ClassX SoundFlexControl Installer.cmd` from the complete project checkout.
2. The batch installs locked dependencies, runs typechecking and the server/UI tests, builds the interface, and packages the desktop application.
3. Distribute `release/ClassX SoundFlexControl Setup 0.1.0.exe` (the version follows `package.json`). Do not distribute the source checkout or `node_modules`.

The per-user installer allows choosing the installation directory and creates desktop/Start menu shortcuts. **End users need no Node.js, npm, or separate browser**. Electron bundles the browser/runtime and existing MixBoard bridge. Initial installers are unsigned and may trigger Windows SmartScreen; production code signing requires ClassX signing credentials.

### Desktop operation

- Launch **ClassX SoundFlexControl** from its shortcut. The existing mixer opens in its own window.
- **Channels → Open CH 0–3 window** opens independent channel windows sharing one MixBoard connection. Existing Ctrl-click channel selection still works.
- Launching the application again focuses an existing window instead of starting another bridge.
- Closing the last window or choosing **Application → Exit** stops the bridge and application.
- Connection settings are saved in the Electron per-user profile (`%APPDATA%/ClassX SoundFlexControl`), independently of browser settings. Uninstalling preserves them.
- The desktop server listens only on `127.0.0.1:3080`; it does not enable LAN access or use web-launcher host/port overrides. Close an existing browser launcher first: an occupied port produces an error rather than attaching to another server. The bridge still connects to the remote MixBoard host configured in **Connection**.

For desktop development, run `npm run build` then `npm run start:desktop`. Manual installer build: `npm ci`, `npm run typecheck`, `npm test`, `npm run build:installer`. The official ClassX PNG is used for the window icon; `desktop/classx.ico` is the same artwork enlarged with preserved aspect ratio on a transparent square for Windows installer/executable branding.

Installer installation and interactive Windows acceptance checks are a separate validation stage; see `agent/desktop_installer/STATUS.md` for current validation results.

## Windows quick start (browser application)

1. Double-click `Setup SoundFlex Control.cmd`. This explicitly installs the locked npm dependencies and creates the production build.
2. Double-click `Start SoundFlex Control.cmd`.
3. Keep the launcher window open while using the controller. The launcher waits for the local server and opens `http://127.0.0.1:3080` in the default browser.
4. Press `Ctrl+C` in the launcher window to stop the controller.

Setup is the only launcher script that installs packages. The start scripts never download, install, or rebuild anything; they report a clear error if dependencies or `dist/index.html` are absent.

### Local-network access

Double-click `Start SoundFlex Control on Local Network.cmd` to listen on all local interfaces. Other devices can then open `http://<controller-ip>:3080`; for example, this workstation currently uses `http://192.168.1.10:3080` on Ethernet.

If Windows Firewall prompts, allow Node.js only on trusted **Private** networks. The controller has no authentication or TLS: any device that can reach this port can operate the configured MixBoard connection. Do not expose port `3080` to the internet or an untrusted network.

## Development

Run the backend and Vite in separate terminals:

```bat
npm run dev:server
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/ws` and `/api` to the loopback backend on port 3080.

## Manual production build and launch

The Windows setup and start scripts are recommended. The equivalent manual commands are:

```bat
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:3080`. The normal launcher binds to loopback by default; the local-network launcher binds to `0.0.0.0`. `SOUNDFLEX_WEB_HOST` and `SOUNDFLEX_WEB_PORT` can override the web binding when explicitly required, while `SOUNDFLEX_BROWSER_HOST` can select the local hostname opened by the launcher. Set `SOUNDFLEX_NO_BROWSER=1` before invoking a start script to suppress automatic browser opening for unattended validation.

## Validation

```bat
npm run typecheck
npm test
npm run build
```

The tests include local mock TCP command/event servers and focused React interaction tests; they do not require a running MixBoard instance.

On Windows, run `npm run test:layout` for actual Edge DOM-bound checks at 3840×2160, 1920×1080, 1366×768, 1280×720, 1024×600, and 900×700, each with 2, 16, and 24 inputs. The runner starts an isolated Vite server on port 5179 and a temporary headless Edge profile with debugging port 9239; keep those ports free. No extra packages are required. Set `SOUNDFLEX_EDGE_PATH` if Edge is installed elsewhere. Optional `SOUNDFLEX_SCREENSHOTS` (absolute output directory) saves Edge captures; also setting `SOUNDFLEX_FIREFOX_PATH` captures the same fixtures in Firefox. Firefox captures are visual checks, not automated DOM-bound assertions.

## MixBoard configuration

Open **Connection** in the application header and enter:

- **MixBoard host:** the hostname or IP address of the machine running MixBoard;
- **Command port:** MBControl's command TCP port, default `701`;
- **Event port:** MBControl's event TCP port, default `801`.

Select **Connect**. The browser stores these values locally under `soundflex-control.connection`; no credentials are stored. The Node bridge, not the browser, opens both TCP connections to the configured remote host.

## Multiple windows, independent channels

Open one URL per window (or tab):

- `http://127.0.0.1:3080/?channel=CH_0`
- `http://127.0.0.1:3080/?channel=CH_1`
- `http://127.0.0.1:3080/?channel=CH_2`
- `http://127.0.0.1:3080/?channel=CH_3`

Replace the host/port with your controller address when connecting over the local network. Start only one Node bridge; all windows reuse it. Missing or invalid channel parameters default to `CH_0`.

**Ctrl-click** switches only the current window and updates its URL, so refresh restores its channel. Native channel changes do not move these local selections. Audio enable, AFV, input-strip gain, program/preview colors and output meters follow each window's own channel.

Output T0–T3 gains, input track assignments, solo, preview track/volume and the MixBoard connection remain shared. Connect/Disconnect affects every window. The preview monitor listens to MixBoard's global preview channel, identified in the knob area's tooltip; opening a window or changing its local channel does not change that listening channel. Change the global preview channel in native MixBoard when needed.

## Connection behavior

The bridge:

- opens and drains the event connection before the command snapshot;
- serializes all command traffic;
- consumes the standard optional welcome line;
- ignores event `PING` heartbeats;
- obtains VideoInput, SoundFlex, and all four MixBoard channel snapshots;
- applies unambiguous MixBoard, VideoInput, and audio events immediately;
- reconciles ambiguous per-input enable, AFV, and volume events with SoundFlex snapshots without guessing the affected channel;
- bounds event reconciliation from the first event so continuous audio events cannot postpone button updates, retains changes received during an active refresh, and prioritizes state reconciliation over new meter cycles;
- immediately displays successfully confirmed web enable/disable commands and briefly rechecks SoundFlex state after enable changes to follow native audio fades; snapshots keep `AUDIO_ENABLED` true during fade-out (500 ms by default, up to 2 seconds), so settling checks run 100 ms after each completed refresh for at most 2.5 seconds after a change;
- rebuilds the complete state every five seconds and after reconnecting;
- uses one shared, demand-driven meter stream for every browser client, polling only while at least one visible page is subscribed;
- reads input RMS once and output RMS once per distinct visible window channel in each shared cycle; starts the next cycle 150 ms after all replies complete and suppresses unchanged per-channel browser updates;
- coalesces queued fader updates so only the latest unsent value for each control is transmitted;
- sends parameterless `MBC_UPDATESOUNDFLEXGUI` after all mutation commands for a web action return `Ok`; local window-channel selection sends no mutation or native refresh; superseded fader actions and failed/invalid actions do not send it;
- sends another native GUI refresh when a web disable's real SoundFlex state confirms fade completion; ordinary snapshots, meter reads, and native events do not themselves request native refreshes;
- reports native GUI refresh failures separately without treating already successful audio mutations as failures; the refresh acknowledgement does not mean the native Swing timer has rendered yet;
- validates and exposes only the SoundFlex actions required by this project;
- reconnects with bounded backoff and rebuilds the snapshot.

No authentication or TLS is provided. Keep the web server loopback-only unless it is placed behind an approved secure deployment layer.

## Meter traffic

Previously the bridge continuously started a meter cycle every 100 ms whenever MixBoard was connected: up to 10 cycles/second, 20 MBControl queries/second, and two Base64 JSON replies per cycle even with no browser viewing the mixer. Slow replies did not overlap, but polling resumed at the next timer tick.

The bridge now runs a single stream shared by all browser clients. A visible page subscribes through the WebSocket; hidden pages suspend their subscription, and polling stops when the last active page suspends or disconnects. Each cycle contains exactly one `MBC_GETVIDEOINPUTRMS` query and one `MBC_GETAUDIOTRACKRMS` query per distinct active channel. The next cycle is scheduled 150 ms after all replies complete: at most about 6.7 cycles/second under ideal latency. One channel uses up to 13.3 queries/second; all four channels use up to 33.3 queries/second. Extra windows on the same channel add no queries. Samples are cached and delivered only to visible subscribers of the matching channel. Idle and fully hidden usage generates no RMS queries. Identical samples remain cached but are not repeatedly sent to browsers.

The exact response byte count depends on the configured VideoInput count and JSON number formatting. No live MixBoard was available to record a representative production payload; automated mock tests verify subscription lifecycle, sharing, backpressure, reconnect behavior, unchanged-sample suppression, and query-rate bounds.

## Browser compatibility

The production application was launched and DOM-rendered successfully with the installed current Microsoft Edge during final validation. The production build also rendered successfully in headless Firefox at 1280×800 using `C:\Program Files (x86)\Mozilla Firefox\firefox.exe`. The viewport fixture passed all 18 actual Edge layout checks (six resolutions × three input counts); screenshot comparisons were also performed in Edge and Firefox, including the 3840×2160 reference and laptop sizes. Reference output-bank and input-strip width ratios are checked within 1.2 and 0.8 percentage points respectively at the four desktop/laptop target resolutions. The application uses standard React, WebSocket, CSS Grid, CSS container queries and units, SVG mask, range-input, Page Visibility, and `localStorage` APIs supported by current Edge, Firefox, and Chrome. Chrome was not installed on the validation workstation, so its runtime check remains an environment-dependent deployment check.

## Troubleshooting

- **Node.js or npm was not found:** install or repair a current Node.js release and ensure `node.exe` and `npm.cmd` are in `PATH`.
- **Dependencies or production build are missing:** run `Setup SoundFlex Control.cmd`; do not run the start script from an incomplete copy of the directory.
- **Port 3080 is already in use:** close the other process or set `SOUNDFLEX_WEB_PORT` to an unused port before starting.
- **The browser does not open:** leave the launcher running and open the URL printed in its window manually.
- **The local page does not load:** verify that the launcher reports `SoundFlex Control is available`, and check `http://127.0.0.1:3080/api/health` for `{"ok":true}`.
- **MixBoard remains disconnected:** verify the remote host and both ports, MBControl protocol 1.1 availability, MixBoard service state, and intervening Windows/network firewall rules.
- **Native SoundFlex controls do not follow web edits:** rebuild/restart MixBoard with `MBC_UPDATESOUNDFLEXGUI` support and restart the Node bridge to load this integration. An older MixBoard may still apply audio edits but report refresh-command errors. A closed native panel refreshes current state when opened, and active knob/fader dragging defers the native refresh until release.
- **Settings need to be reset:** clear the site's stored data for the local SoundFlex URL, or remove the `soundflex-control.connection` local-storage entry in browser developer tools.
- **Meters lag:** keep the mixer tab visible and check network latency to MixBoard. Meter polling pauses in hidden pages and is deliberately bounded so slow replies cannot build an unbounded queue.

## Interface notes

- Output-channel selection requires **Ctrl-click** on a channel button and changes only the current window; a normal click does not change channel.
- The mixer uses the same two-row input ordering as the native panel and proportionally scales its header, output bank, strips, controls, type, and spacing to fit desktop and laptop browser viewports without page scrolling. Very narrow mobile layouts retain an internal horizontal fallback rather than making controls unusably small.
- Preview controls reuse the native `knob_icon.png` artwork: 17 red level LEDs and a red position dot follow the Java knob's 300° sweep. The existing 0–100% web range interaction, T0–T3 selection, and solo indicator behavior are unchanged.
- Input and output faders match native SoundFlex's −∞ to +10 dB range (the −60 dB endpoint is mute). Unity gain is 0 dB; +10 dB sends linear gain approximately 3.162. The preview knob remains 0–100%, and RMS meters still reach full scale at 0 dB.
- Right-click an enabled input or output fader to reset it to **0 dB (unity gain)**, not mute. The preview knob is unchanged.
- Right-click an input T0–T3 assignment button to select that input's displayed meter track, matching the native local meter-selection behavior.
- The audio-settings button is intentionally visible but disabled.
- The ClassX and SoundFlex names, interface, and copied SVG artwork are property of ClassX srl — https://www.classx.it.
