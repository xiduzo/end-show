import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";

import { StageCard } from "@/features/stage";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/stage-preview/$userId")({
  component: StagePreviewRoute,
});

function StagePreviewRoute() {
  const { userId } = Route.useParams();
  const router = useRouter();
  const { data: student, isLoading } = useQuery(
    trpc.student.byUserId.queryOptions({ userId }),
  );

  const goBack = () => {
    if (window.history.length > 1) router.history.back();
    else window.close();
  };

  if (isLoading) return <div className="bg-lego h-full w-full" />;

  if (!student) {
    return (
      <div className="bg-lego flex h-full w-full items-center justify-center text-chalkboard">
        <div className="text-center font-mono">
          <p className="text-sm">no preview data</p>
          <p className="mt-1 text-xs text-chalkboard/60">
            this student does not exist yet.
          </p>
          <button
            type="button"
            onClick={goBack}
            className="mt-4 rounded-full border border-chalkboard/30 px-4 py-1.5 text-xs uppercase tracking-widest hover:bg-chalkboard/10"
          >
            ← back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      <StageCard student={student} />
      <button
        type="button"
        onClick={goBack}
        className="absolute top-4 left-4 z-30 rounded-full bg-chalkboard/80 px-4 py-1.5 font-mono text-[11px] tracking-widest text-lego-dark uppercase backdrop-blur hover:bg-chalkboard"
      >
        ← back
      </button>
    </div>
  );
}
