import { ONE_LINER_MAX } from "./types";

export function OneLinerMeter({ value }: { value: string }) {
  const len = value.length;
  const tone =
    len === 0
      ? "0 / 80"
      : len < 40
        ? `${len} / 80 · keep going`
        : len < 60
          ? `${len} / 80 · nice`
          : len <= ONE_LINER_MAX
            ? `${len} / 80 · looking good`
            : `${len} / 80 · over`;
  return (
    <p className="mt-1 text-right font-mono text-[10px] text-lego-dark/40">
      {tone}
    </p>
  );
}
