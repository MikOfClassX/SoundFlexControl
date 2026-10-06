import { useEffect, useState } from "react";
import { dbToLinear, formatDb, linearToDb, MAX_DB, MIN_DB } from "../audio";

// Java paints major ticks every 10 dB and minor ticks every 2 dB.
const SCALE_TICKS = Array.from({ length: (MAX_DB - MIN_DB) / 2 + 1 }, (_, index) => MAX_DB - index * 2);

interface FaderProps {
  value: number;
  label: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export default function Fader({ value, label, disabled = false, onChange }: FaderProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  const update = (db: number) => {
    const linear = dbToLinear(db);
    setEditing(true);
    setDraft(linear);
    onChange(linear);
  };

  return (
    <div className="fader" title={`${label}: ${formatDb(draft)}`}>
      <div className="fader-scale" aria-hidden="true">
        {SCALE_TICKS.map((db) => (
          <span
            className={`fader-tick ${db % 10 === 0 ? "major" : "minor"}`}
            data-db={db}
            key={db}
            style={{ top: `${(MAX_DB - db) / (MAX_DB - MIN_DB) * 100}%` }}
          >
            {db % 10 === 0 ? (db === MIN_DB ? "−∞" : db > 0 ? `+${db}` : String(db).replace("-", "−")) : ""}
          </span>
        ))}
      </div>
      <input
        aria-label={label}
        className="vertical-range"
        disabled={disabled}
        max={MAX_DB}
        min={MIN_DB}
        onBlur={() => setEditing(false)}
        onChange={(event) => update(Number(event.target.value))}
        onContextMenu={(event) => {
          event.preventDefault();
          if (disabled) return;
          update(0);
          setEditing(false);
        }}
        onKeyUp={() => setEditing(false)}
        onPointerDown={() => setEditing(true)}
        onPointerUp={() => setEditing(false)}
        step="0.5"
        type="range"
        title="Right-click to reset to 0 dB"
        value={linearToDb(draft)}
      />
    </div>
  );
}
