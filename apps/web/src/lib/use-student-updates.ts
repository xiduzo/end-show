import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { trpc, trpcClient } from "./trpc";

/**
 * Subscribe to server-pushed Student profile updates and invalidate any
 * locally-cached views of that Student. Mount once per page that renders
 * Student data (Companion wall, Stage view).
 */
export function useStudentUpdates(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = trpcClient.student.watchUpdates.subscribe(undefined, {
      onData: ({ userId }) => {
        void qc.invalidateQueries({
          queryKey: trpc.student.listEligible.queryKey(),
        });
        void qc.invalidateQueries({
          queryKey: trpc.student.byUserId.queryKey({ userId }),
        });
      },
      onError: (e) => console.error("student.watchUpdates error", e),
    });
    return () => sub.unsubscribe();
  }, [qc]);
}
