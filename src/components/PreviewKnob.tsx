// Match AudioVolumeKnobPanel's 60px geometry without changing the web range control.
const TICK_COUNT = 17;
const MIN_ANGLE = 120;
const ANGLE_SWEEP = 300;

function position(ratio: number, radius: number) {
  const angle = ((MIN_ANGLE + ANGLE_SWEEP * ratio) * Math.PI) / 180;
  return { x: 30 + radius * Math.cos(angle), y: 30 + radius * Math.sin(angle) };
}

export default function PreviewKnob({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const ratio = Math.max(0, Math.min(1, value));
  const dot = position(ratio, 12);
  return (
    <div className="preview-knob" title={`Preview volume ${Math.round(value * 100)}%`}>
      <svg className="knob-face" viewBox="0 0 60 60" aria-hidden="true" focusable="false">
        <image href="/assets/knob_icon.png" x="10" y="10" width="40" height="40" />
        {Array.from({ length: TICK_COUNT }, (_, index) => {
          const tickRatio = index / (TICK_COUNT - 1);
          const tick = position(tickRatio, 26);
          const on = ratio > 0 && tickRatio <= ratio;
          return <circle className={`knob-led${on ? " is-on" : ""}`} key={index} cx={tick.x} cy={tick.y} r="2" />;
        })}
        <circle className="knob-position" cx={dot.x} cy={dot.y} r="3" />
      </svg>
      <input
        aria-label="Preview monitor volume"
        max="1"
        min="0"
        onChange={(event) => onChange(Number(event.target.value))}
        step="0.01"
        type="range"
        value={value}
      />
    </div>
  );
}
