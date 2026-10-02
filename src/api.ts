import type { ConnectionSettings, ServerMessage, SoundFlexAction } from "./types";

export const SETTINGS_STORAGE_KEY = "soundflex-control.connection";
export const DEFAULT_SETTINGS: ConnectionSettings = {
  host: "127.0.0.1",
  commandPort: 701,
  eventPort: 801,
};

type MessageListener = (message: ServerMessage) => void;

export class SoundFlexApi {
  private socket: WebSocket | null = null;
  private listeners = new Set<MessageListener>();
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private metersActive = false;

  open(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      this.socket = socket;

      socket.addEventListener("open", () => {
        this.sendMeterSubscription();
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not connect to the local SoundFlex bridge")), { once: true });
      socket.addEventListener("message", (event) => this.handleMessage(event.data));
      socket.addEventListener("close", () => {
        this.socket = null;
        for (const request of this.pending.values()) request.reject(new Error("Local bridge connection closed"));
        this.pending.clear();
      });
    });
  }

  close(): void {
    this.socket?.close();
  }

  subscribe(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(settings: ConnectionSettings): Promise<unknown> {
    return this.request("connect", settings);
  }

  disconnect(): Promise<unknown> {
    return this.request("disconnect", null);
  }

  requestSnapshot(): Promise<unknown> {
    return this.request("snapshot.request", null);
  }

  sendAction(action: SoundFlexAction): Promise<unknown> {
    return this.request("action", action);
  }

  setMetersActive(active: boolean): void {
    this.metersActive = active;
    this.sendMeterSubscription();
  }

  private sendMeterSubscription(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "meters.subscription", payload: { active: this.metersActive } }));
    }
  }

  private request(type: string, payload: unknown): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Local SoundFlex bridge is not connected"));
    }

    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.socket?.send(JSON.stringify({ type, requestId, payload }));
    });
  }

  private handleMessage(raw: unknown): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(raw)) as ServerMessage;
    } catch {
      return;
    }

    if (message.requestId && (message.type === "request.result" || message.type === "error")) {
      const request = this.pending.get(message.requestId);
      if (request) {
        this.pending.delete(message.requestId);
        if (message.type === "error") {
          const payload = message.payload as { message?: string };
          request.reject(new Error(payload.message || "SoundFlex request failed"));
        } else {
          request.resolve(message.payload);
        }
      }
    }

    for (const listener of this.listeners) listener(message);
  }
}

export function loadSettings(): ConnectionSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<ConnectionSettings>;
    return {
      host: String(parsed.host || DEFAULT_SETTINGS.host),
      commandPort: Number(parsed.commandPort || DEFAULT_SETTINGS.commandPort),
      eventPort: Number(parsed.eventPort || DEFAULT_SETTINGS.eventPort),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ConnectionSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
