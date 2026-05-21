import { useWsConnectionStore } from "@/lib/wsConnection";

export function ConnectionIndicator({ light = false }: { light?: boolean }) {
  const connected = useWsConnectionStore((s) => s.connected);
  if (connected) return null;
  return (
    <div
      className={`pointer-events-none fixed top-2 left-1/2 z-50 -translate-x-1/2 rounded-full px-3 py-1 text-xs ${
        light ? "bg-black/70 text-white" : "bg-amber-100 text-amber-800"
      }`}
    >
      reconnecting…
    </div>
  );
}
