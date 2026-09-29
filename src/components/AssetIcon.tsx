interface AssetIconProps {
  name: string;
  label?: string;
  className?: string;
}

export default function AssetIcon({ name, label, className = "" }: AssetIconProps) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={`asset-icon ${className}`}
      role={label ? "img" : undefined}
      style={{
        WebkitMaskImage: `url(/assets/${name}.svg)`,
        maskImage: `url(/assets/${name}.svg)`,
      }}
    />
  );
}
