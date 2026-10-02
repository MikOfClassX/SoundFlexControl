# SoundFlex Control

SoundFlex Control is a React web controller backed by a local Node.js bridge to MixBoard's MBControl TCP command and event services.

The responsive interface follows the native SoundFlex mixer: preview monitor controls, channel selection, four output tracks, and dynamically discovered VideoInput strips with routing, solo, AFV, faders, and live stereo metering.

## Requirements

- A current Node.js installation available in `PATH`. Node.js 24 is used by the current development environment.
- A MixBoard build exposing MBControl protocol 1.1.
- Network access from this machine to MixBoard's command and event ports.
- A current Edge, Firefox, or Chrome browser.

## Windows quick start

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

## MixBoard configuration

Open **Connection** in the application header and enter:

- **MixBoard host:** the hostname or IP address of the machine running MixBoard;
- **Command port:** MBControl's command TCP port, default `701`;
- **Event port:** MBControl's event TCP port, default `801`.

Select **Connect**. The browser stores these values locally under `soundflex-control.connection`; no credentials are stored. The Node bridge, not the browser, opens both TCP connections to the configured remote host.

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
- polls input and selected-channel output RMS at most every 150 ms, starts the next cycle only after both replies complete, and suppresses unchanged browser updates;
- coalesces queued fader updates so only the latest unsent value for each control is transmitted;
- validates and exposes only the SoundFlex actions required by this project;
- reconnects with bounded backoff and rebuilds the snapshot.

No authentication or TLS is provided. Keep the web server loopback-only unless it is placed behind an approved secure deployment layer.

## Meter traffic

Previously the bridge continuously started a meter cycle every 100 ms whenever MixBoard was connected: up to 10 cycles/second, 20 MBControl queries/second, and two Base64 JSON replies per cycle even with no browser viewing the mixer. Slow replies did not overlap, but polling resumed at the next timer tick.

The bridge now runs a single stream shared by all browser clients. A visible page subscribes through the WebSocket; hidden pages suspend their subscription, and polling stops when the last active page suspends or disconnects. Each cycle contains exactly one `MBC_GETVIDEOINPUTRMS` query and one selected-channel `MBC_GETAUDIOTRACKRMS` query. The next cycle is scheduled 150 ms after both replies complete, so the maximum is about 6.7 cycles/second or 13.3 queries/second under ideal latency, independent of browser count. Idle and fully hidden usage generates no RMS queries. Identical samples remain cached but are not repeatedly sent to browsers.

The exact response byte count depends on the configured VideoInput count and JSON number formatting. No live MixBoard was available to record a representative production payload; automated mock tests verify subscription lifecycle, sharing, backpressure, reconnect behavior, unchanged-sample suppression, and query-rate bounds.

## Browser compatibility

The production application was launched and DOM-rendered successfully with the installed current Microsoft Edge during final validation. The production build also rendered successfully in headless Firefox at 1280×800 using `C:\Program Files (x86)\Mozilla Firefox\firefox.exe`. The layout has explicit automated contracts for 3840×2160, 1920×1080, 1366×768, and 1280×720 browser viewports. The application uses standard React, WebSocket, CSS Grid, CSS container queries and units, SVG mask, range-input, Page Visibility, and `localStorage` APIs supported by current Edge, Firefox, and Chrome. Chrome was not installed on the validation workstation, so its runtime check remains an environment-dependent deployment check.

## Troubleshooting

- **Node.js or npm was not found:** install or repair a current Node.js release and ensure `node.exe` and `npm.cmd` are in `PATH`.
- **Dependencies or production build are missing:** run `Setup SoundFlex Control.cmd`; do not run the start script from an incomplete copy of the directory.
- **Port 3080 is already in use:** close the other process or set `SOUNDFLEX_WEB_PORT` to an unused port before starting.
- **The browser does not open:** leave the launcher running and open the URL printed in its window manually.
- **The local page does not load:** verify that the launcher reports `SoundFlex Control is available`, and check `http://127.0.0.1:3080/api/health` for `{"ok":true}`.
- **MixBoard remains disconnected:** verify the remote host and both ports, MBControl protocol 1.1 availability, MixBoard service state, and intervening Windows/network firewall rules.
- **Settings need to be reset:** clear the site's stored data for the local SoundFlex URL, or remove the `soundflex-control.connection` local-storage entry in browser developer tools.
- **Meters lag:** keep the mixer tab visible and check network latency to MixBoard. Meter polling pauses in hidden pages and is deliberately bounded so slow replies cannot build an unbounded queue.

## Interface notes

- The mixer uses the same two-row input ordering as the native panel and proportionally scales its header, output bank, strips, controls, type, and spacing to fit desktop and laptop browser viewports without page scrolling. Very narrow mobile layouts retain an internal horizontal fallback rather than making controls unusably small.
- Right-click an input T0–T3 assignment button to select that input's displayed meter track, matching the native local meter-selection behavior.
- The audio-settings button is intentionally visible but disabled.
- The ClassX and SoundFlex names, interface, and copied SVG artwork are property of ClassX srl — https://www.classx.it.
