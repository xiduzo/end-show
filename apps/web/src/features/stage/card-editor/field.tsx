export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-widest text-lego-dark/60 uppercase">
          {label}
          {required && <span className="ml-0.5 text-slide">*</span>}
        </span>
        {hint && (
          <span className="font-mono text-[10px] text-lego-dark/40">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
