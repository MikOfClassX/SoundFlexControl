import { app, BrowserWindow, dialog, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWebServer } from "../server/web-server.js";

const productName = "ClassX SoundFlexControl";
const origin = "http://127.0.0.1:3080";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let application;
let shuttingDown = false;
let shutdownComplete = false;

app.setName(productName);
app.setAppUserModelId("it.classx.soundflexcontrol");

function isMixerURL(value) {
  try {
    const url = new URL(value);
    return url.origin === origin && url.pathname === "/";
  } catch {
    return false;
  }
}

async function openChannel(channel = "CH_0") {
  const window = new BrowserWindow({
    title: productName,
    width: 1366,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#101010",
    icon: path.join(projectRoot, "dist/assets/classx_icon.png"),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isMixerURL(url)) event.preventDefault();
  });
  window.webContents.on("will-redirect", (event, url) => {
    if (!isMixerURL(url)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("page-title-updated", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.once("ready-to-show", () => window.show());
  try {
    await window.loadURL(`${origin}/?channel=${channel}`);
  } catch (error) {
    window.destroy();
    throw error;
  }
}

function reportError(error) {
  const message = error?.code === "EADDRINUSE"
    ? "Port 3080 is already in use. Close the SoundFlex Control browser launcher or other process using this port, then try again."
    : error instanceof Error ? error.message : String(error);
  dialog.showErrorBox(productName, message);
}

function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Channels",
      submenu: [0, 1, 2, 3].map((channel) => ({
        label: `Open CH ${channel} window`,
        click: () => openChannel(`CH_${channel}`).catch(reportError),
      })),
    },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }] },
    { label: "Application", submenu: [{ role: "quit", label: "Exit" }] },
  ]));
}

async function start() {
  application = createWebServer();
  await new Promise((resolve, reject) => {
    application.server.once("error", reject);
    application.server.listen(3080, "127.0.0.1", () => {
      application.server.removeListener("error", reject);
      resolve();
    });
  });
  createMenu();
  await openChannel();
}

// Keep only one bridge owner, and never attach to an unrelated server on port 3080.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (shuttingDown) return;
    shuttingDown = true;
    // Destroy renderers first so their WebSocket subscriptions cannot delay shutdown.
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    const timeout = setTimeout(() => app.exit(0), 3000);
    Promise.resolve().then(() => application?.close()).catch((error) => {
      console.error("Desktop shutdown failed:", error);
    }).finally(() => {
      clearTimeout(timeout);
      shutdownComplete = true;
      app.quit();
    });
  });
  app.whenReady().then(start).catch((error) => {
    reportError(error);
    app.quit();
  });
}
