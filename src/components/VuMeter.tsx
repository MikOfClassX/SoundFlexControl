import { meterPercent } from "../audio";

interface VuMeterProps {
  left: number;
  right: number;
  label: string;
}

export default function VuMeter({ left, right, label }: VuMeterProps) {
  return (
    <div className="vu-pair" aria-label={`${label} stereo level`} role="group">
      <MeterBar label={`${label} left level`} value={left} />
      <MeterBar label={`${label} right level`} value={right} />
    </div>
  );
}

function MeterBar({ value, label }: { value: number; label: string }) {
  const percent = meterPercent(value);
  return (
    <span aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(percent)} className="vu-bar" role="meter">
      <span className="vu-fill" style={{ height: `${percent}%` }} />
    </span>
  );
}
