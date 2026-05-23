/**
 * In-process fan-out for Student profile changes. Any write that affects what
 * the Companion wall or Stage view renders for a Student should call
 * `emitStudentUpdate(userId)`; subscribers (tRPC `student.watchUpdates`) push
 * the userId to connected clients so they can invalidate their caches.
 */

export type StudentUpdate = { userId: string };

const listeners = new Set<(u: StudentUpdate) => void>();

export function emitStudentUpdate(userId: string): void {
  const evt: StudentUpdate = { userId };
  for (const cb of listeners) {
    try {
      cb(evt);
    } catch (e) {
      console.warn("[studentEvents] listener threw", e);
    }
  }
}

export function subscribeStudentUpdates(
  cb: (u: StudentUpdate) => void,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
