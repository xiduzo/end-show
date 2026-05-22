import type { StudentSummary } from "@end-show/api/routers/student";
import { cn } from "@end-show/ui/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

import { STAGE_HEIGHT, STAGE_WIDTH, StageCard } from "./stage-card";

export function ScaledStageCard({
  student,
  className,
}: {
  student: StudentSummary;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setScale(Math.min(w / STAGE_WIDTH, h / STAGE_HEIGHT));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)}>
      <div
        className="absolute top-0 left-0"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      >
        <StageCard student={student} />
      </div>
    </div>
  );
}
