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
- reconciles ambiguous audio events and successful mutations with SoundFlex snapshots;
- rebuilds the complete state every five seconds and after reconnecting;
- polls input and selected-channel output RMS at a bounded 100 ms cadence, skipping obsolete cycles when replies are slow;
- coalesces queued fader updates so only the latest unsent value for each control is transmitted;
- validates and exposes only the SoundFlex actions required by this project;
- reconnects with bounded backoff and rebuilds the snapshot.

No authentication or TLS is provided. Keep the web server loopback-only unless it is placed behind an approved secure deployment layer.

## Browser compatibility

The production application was launched and DOM-rendered successfully with the installed current Microsoft Edge during final validation. It uses standard React, WebSocket, CSS Grid, SVG mask, range-input, and `localStorage` APIs supported by current Edge, Firefox, and Chrome. Chrome and Firefox were not installed on the validation workstation, so runtime checks in those two browsers remain an environment-dependent deployment check.

## Troubleshooting

- **Node.js or npm was not found:** install or repair a current Node.js release and ensure `node.exe` and `npm.cmd` are in `PATH`.
- **Dependencies or production build are missing:** run `Setup SoundFlex Control.cmd`; do not run the start script from an incomplete copy of the directory.
- **Port 3080 is already in use:** close the other process or set `SOUNDFLEX_WEB_PORT` to an unused port before starting.
- **The browser does not open:** leave the launcher running and open the URL printed in its window manually.
- **The local page does not load:** verify that the launcher reports `SoundFlex Control is available`, and check `http://127.0.0.1:3080/api/health` for `{"ok":true}`.
- **MixBoard remains disconnected:** verify the remote host and both ports, MBControl protocol 1.1 availability, MixBoard service state, and intervening Windows/network firewall rules.
- **Settings need to be reset:** clear the site's stored data for the local SoundFlex URL, or remove the `soundflex-control.connection` local-storage entry in browser developer tools.
- **Meters lag:** check network latency to MixBoard. Meter polling is deliberately bounded and skips obsolete cycles rather than building an unbounded queue.

## Interface notes

- The mixer uses the same two-row input ordering as the native panel at desktop sizes and switches to a horizontally scrollable single row on short screens.
- Right-click an input T0–T3 assignment button to select that input's displayed meter track, matching the native local meter-selection behavior.
- The audio-settings button is intentionally visible but disabled.
- The ClassX and SoundFlex names, interface, and copied SVG artwork are property of ClassX srl — https://www.classx.it.
