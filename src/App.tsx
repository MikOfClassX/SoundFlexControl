import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { loadSettings, saveSettings, SoundFlexApi } from "./api";
import Mixer from "./components/Mixer";
import type {
  ConnectionSettings,
  ConnectionStatus,
  ServerMessage,
  SoundFlexAction,
  SoundFlexMeters,
  SoundFlexSnapshot,
} from "./types";
import "./styles.css";

export default function App() {
  const api = useMemo(() => new SoundFlexApi(), []);
  const [settings, setSettings] = useState<ConnectionSettings>(() => loadSettings());
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [snapshot, setSnapshot] = useState<SoundFlexSnapshot | null>(null);
  const [meters, setMeters] = useState<SoundFlexMeters | null>(null);
  const [error, setError] = useState("");
  const [bridgeReady, setBridgeReady] = useState(false);
  const [showConnection, setShowConnection] = useState(true);

  useEffect(() => {
    const unsubscribe = api.subscribe((message: ServerMessage) => {
      if (message.type === "connection") {
        const payload = message.payload as { status: ConnectionStatus };
        setStatus(payload.status);
        if (payload.status === "connected") setShowConnection(false);
      } else if (message.type === "snapshot" || message.type === "state") {
        setSnapshot(message.payload as SoundFlexSnapshot);
      } else if (message.type === "meters") {
        const nextMeters = message.payload as SoundFlexMeters;
        setMeters((current) => !current || nextMeters.sequence > current.sequence ? nextMeters : current);
      } else if (message.type === "error" && !message.requestId) {
        const payload = message.payload as { message?: string };
        setError(payload.message || "MixBoard bridge error");
      }
    });

    const updateMeterActivity = () => api.setMetersActive(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateMeterActivity);
    updateMeterActivity();
    api.open().then(() => setBridgeReady(true)).catch((reason: Error) => setError(reason.message));
    return () => {
      document.removeEventListener("visibilitychange", updateMeterActivity);
      api.setMetersActive(false);
      unsubscribe();
      api.close();
    };
  }, [api]);

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    saveSettings(settings);
    try {
      await api.connect(settings);
      setShowConnection(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const disconnect = async () => {
    setError("");
    try {
      await api.disconnect();
      setSnapshot(null);
      setMeters(null);
      setShowConnection(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const performAction = (action: SoundFlexAction) => {
    setError("");
    api.sendAction(action).catch((reason: Error) => setError(reason.message));
  };

  return (
    <main className="app-shell">
      <header className="app-bar">
        <div className="app-title">
          <img className="classx-mark" src="/assets/classx_icon.png" alt="ClassX" />
          <span>SoundFlex v1.0 - (C) ClassX 2026</span>
        </div>
        <img alt="SoundFlex" className="soundflex-logo" src="/assets/soundflex_logo.svg" />
        <button className="connection-toggle" onClick={() => setShowConnection((shown) => !shown)} type="button">
          Connection
        </button>
        <span className={`status status-${status}`}>{status}</span>
      </header>

      {showConnection && (
        <ConnectionPanel
          bridgeReady={bridgeReady}
          onConnect={connect}
          onDisconnect={disconnect}
          onSettingsChange={setSettings}
          settings={settings}
          status={status}
        />
      )}

      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")} type="button">×</button>
        </div>
      )}

      {snapshot ? (
        <Mixer meters={meters} onAction={performAction} snapshot={snapshot} />
      ) : (
        <section className="empty-mixer" aria-live="polite">
          <img alt="SoundFlex" src="/assets/soundflex_logo.svg" />
          <h1>SoundFlex Control</h1>
          <p>{status === "connecting" || status === "reconnecting" ? "Waiting for MixBoard state…" : "Configure and connect to MixBoard to open the mixer."}</p>
          {!showConnection && <button onClick={() => setShowConnection(true)} type="button">Open connection settings</button>}
        </section>
      )}
    </main>
  );
}

interface ConnectionPanelProps {
  settings: ConnectionSettings;
  status: ConnectionStatus;
  bridgeReady: boolean;
  onSettingsChange: (settings: ConnectionSettings) => void;
  onConnect: (event: FormEvent) => void;
  onDisconnect: () => void;
}

function ConnectionPanel({ settings, status, bridgeReady, onSettingsChange, onConnect, onDisconnect }: ConnectionPanelProps) {
  return (
    <section className="connection-panel" aria-label="MixBoard connection settings">
      <form onSubmit={onConnect}>
        <label>
          MixBoard host
          <input value={settings.host} onChange={(event) => onSettingsChange({ ...settings, host: event.target.value })} required />
        </label>
        <label>
          Command port
          <input type="number" min="1" max="65535" value={settings.commandPort} onChange={(event) => onSettingsChange({ ...settings, commandPort: Number(event.target.value) })} required />
        </label>
        <label>
          Event port
          <input type="number" min="1" max="65535" value={settings.eventPort} onChange={(event) => onSettingsChange({ ...settings, eventPort: Number(event.target.value) })} required />
        </label>
        <button type="submit" disabled={!bridgeReady || status === "connecting"}>Connect</button>
        <button type="button" onClick={onDisconnect} disabled={!bridgeReady || status === "disconnected"}>Disconnect</button>
      </form>
    </section>
  );
}
