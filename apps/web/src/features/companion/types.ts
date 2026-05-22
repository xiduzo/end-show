export type QueueSnap = {
  stageCode: string | null;
  items: Array<{
    studentUserId: string;
    source: "kiosk" | "mobile" | "rotation" | "resume";
  }>;
  next: string | null;
};

export type StageSnap = {
  stageCode: string | null;
  current: { studentUserId: string; startedAt: number; source: string } | null;
  dwellMs: number;
};

export type CompanionTier = "mobile" | "kiosk";
