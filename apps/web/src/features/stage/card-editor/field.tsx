export function Field({
  label,
  required,
  hint,
  subtext,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  subtext?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
          {label}
          {required && <span className="ml-0.5 text-slide">*</span>}
        </span>
        {hint && (
          <span className="font-mono text-xs text-lego-dark/40">
            {hint}
          </span>
        )}
      </div>
      {subtext && (
        <p className="mb-1.5 font-mono text-xs text-lego-dark/50">{subtext}</p>
      )}
      {children}
    </div>
  );
}
