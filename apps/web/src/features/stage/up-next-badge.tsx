import type { StudentSummary } from "@end-show/api/routers/student";
import { cn } from "@end-show/ui/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

import { MorphingName } from "@/features/text-effects";

import { DesatCrossfade } from "./desat-crossfade";
import { resolveScrim } from "./stage-card-resolvers";

export function UpNextBadge({
  student,
  className,
}: {
  student: StudentSummary;
  className?: string;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const scrim = resolveScrim(student);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-full backdrop-blur transition-[width,background-color,box-shadow] duration-700 ease-out",
        className,
      )}
      style={{
        ...(width != null ? { width } : {}),
        backgroundColor: scrim.accent,
        boxShadow: `0 25px 50px -12px ${scrim.accent}20`,
      }}
    >
      <div
        ref={innerRef}
        className="flex w-max items-center gap-3 py-1.5 pr-6 pl-1.5"
      >
        <UpNextAvatar student={student} size={42} />
        <div
          className="leading-tight transition-colors duration-700"
          style={{ color: scrim.dark }}
        >
          <p className="font-mono text-xs tracking-widest uppercase">Up next</p>
          <MorphingName
            text={student.displayName}
            compact
            className="font-display font-bold"
          />
        </div>
      </div>
    </div>
  );
}

function UpNextAvatar({
  student,
  size,
}: {
  student: StudentSummary;
  size: number;
}) {
  if (student.portraitUrl) {
    return (
      <div
        className="relative overflow-hidden rounded-full border border-chalkboard/15"
        style={{ width: size, height: size }}
      >
        <DesatCrossfade
          src={student.portraitUrl}
          alt={student.displayName}
          className="h-full w-full object-cover"
          durationMs={800}
        />
      </div>
    );
  }
  return (
    <div
      className="relative overflow-hidden rounded-full bg-chalkboard/95"
      style={{ width: size, height: size }}
    />
  );
}
