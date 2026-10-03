import { useEffect, useState } from "react";
import { dbToLinear, formatDb, linearToDb, MAX_DB, MIN_DB } from "../audio";

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
        <span>+10</span><span>0</span><span>−10</span><span>−20</span><span>−30</span><span>−40</span><span>−50</span><span>−∞</span>
      </div>
      <input
        aria-label={label}
        className="vertical-range"
        disabled={disabled}
        max={MAX_DB}
        min={MIN_DB}
        onBlur={() => setEditing(false)}
        onChange={(event) => update(Number(event.target.value))}
        onKeyUp={() => setEditing(false)}
        onPointerDown={() => setEditing(true)}
        onPointerUp={() => setEditing(false)}
        step="0.5"
        type="range"
        value={linearToDb(draft)}
      />
    </div>
  );
}
