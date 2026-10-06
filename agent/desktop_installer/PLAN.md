# ClassX SoundFlexControl desktop installer

## Purpose
Package the existing SoundFlexControl web controller as a Windows desktop application named **ClassX SoundFlexControl**, and provide a double-clickable batch that creates its installer. End users must not need Node.js, npm, or a separate browser.

## Existing architecture
- Vite builds the React interface into `dist/`.
- `server/web-server.js` exports `createWebServer()` with the existing MixBoard bridge and asynchronous `close()` lifecycle.
- Static files are resolved relative to the server module's project root.
- Connection settings are stored in browser localStorage; window channel selection uses URL parameters.
- Existing Windows web setup/start scripts remain supported and unchanged.

## Proposed implementation
Use Electron for the desktop runtime and electron-builder for a Windows x64 NSIS installer. Bundle the existing server, production interface, and production Node dependencies. No MixBoard protocol or mixer interface changes.

- Product name: `ClassX SoundFlexControl`.
- Installer batch: `Build ClassX SoundFlexControl Installer.cmd`.
- Build output: `release/ClassX SoundFlexControl Setup <version>.exe`.
- Use the official `public/assets/classx_icon.png` for desktop branding; inspect its dimensions and available official ICO assets before choosing installer icon handling. Do not invent artwork.
- Main process starts `createWebServer()` bound only to `127.0.0.1`, then loads its URL in a BrowserWindow after listening succeeds.
- Use a stable local port (3080) to retain localStorage across launches. Report occupied-port failures rather than loading an unrelated existing server. Existing browser and desktop launchers cannot own that port simultaneously.
- Enforce one desktop application instance; a second launch focuses an existing window.
- Keep renderer Node integration off, context isolation on, and sandbox on. Deny unrequested new windows, external navigation, and permissions.
- Provide a minimal native menu to open separate CH_0–CH_3 windows sharing one bridge and one persistent Electron session.
- Closing the last window shuts down the bridge/server and quits; bound shutdown so stalled sockets cannot leave a background process.
- Preserve connection settings in Electron's per-user application data, separate from the user's external browser.
- Windows per-user installer with install-location selection and shortcuts. No LAN listener, auto-update, portable executable, protocol changes, or UI redesign in this task.

## Tasks and exit criteria
1. **Plan review**: approve architecture and file scope before modifying production files.
2. **Desktop and installer implementation**: add Electron main entry, packaging config, locked build dependencies, installer batch, ignore rules, and README instructions. Batch checks Node/npm, performs locked installation, typecheck/tests, web build, and installer build; propagates failures and prints installer location. Exit: reviewable diff and build/test evidence.
3. **Windows acceptance validation**: generate installer, install and launch, check actual mixer rendering, persistence, multiple windows, second-instance focusing, occupied-port error, and shutdown. Exit: recorded results; identify live MixBoard checks unavailable in the environment.

## Expected files
- `desktop/main.js` (new)
- `electron-builder.yml` (new)
- `Build ClassX SoundFlexControl Installer.cmd` (new)
- `package.json`, `package-lock.json` (build dependencies, main entry, metadata, scripts)
- `.gitignore` (release output)
- `README.md` (build/deployment instructions and desktop behavior)
- Official icon copy/conversion only if needed for Windows installer branding.

## Validation and risks
Run existing typecheck, server/UI tests, and production build. Check packaged module/static asset resolution and production dependency inclusion. Validate on Windows, not just source syntax. Building requires internet access for npm, Electron, and packaging tools; runtime does not. Select supported pinned dependency versions during implementation and update the lockfile. Unsigned installers may trigger SmartScreen; code signing is a separate deployment decision requiring ClassX credentials. Target Windows x64 initially; ARM64 and other operating systems are excluded.

## Acceptance
Double-clicking the batch on a Windows build machine with current Node.js produces a branded installer. Installation launches the existing mixer in its own window without separately installed Node.js/browser. Existing web workflows remain intact. Installer output and any untested acceptance cases are explicitly documented.
