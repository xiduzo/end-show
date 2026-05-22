export function EmptyState({
  loading,
  filtering,
}: {
  loading: boolean;
  filtering: boolean;
}) {
  const msg = loading
    ? "loading students…"
    : filtering
      ? "no matches"
      : "no students yet";
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="font-mono text-xs tracking-widest text-chalkboard/40 uppercase">
        {msg}
      </p>
    </div>
  );
}
