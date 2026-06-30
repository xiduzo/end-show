import { db } from "@end-show/db";
import { user } from "@end-show/db/schema/auth";
import { asset, budgetLoan } from "@end-show/db/schema/asset";
import { student, studentCompetency } from "@end-show/db/schema/student";
import { and, eq, inArray, sum } from "drizzle-orm";

/**
 * Repository seam for the Student-shaped domain reads that sit beneath branchy
 * domain logic — Budget arithmetic (budget.ts) and Rotation eligibility
 * (queue/stageTime.ts). Those modules used to interleave Drizzle query-builder
 * calls with their logic, so a Budget unit test had to stand up libsql. This is
 * the same pattern the Appearance Log already proves (interface + Drizzle +
 * in-memory + get/set singleton); two adapters justify the seam.
 *
 * Out of scope by design: admin CRUD and the read-model assemblers in the
 * routers (listEligible/byUserId/getMyProfile) keep their direct Drizzle calls
 * — a repository over a pass-through projection fails the deletion test.
 */

/** A Rotation-eligible candidate plus the inputs the completeness check needs.
 *  Completeness (and the decile fairness drop) stay in the caller. */
export type EligibilityCandidate = {
  userId: string;
  displayName: string;
  introduction: string;
  portraitAssetId: string | null;
  workMediaAssetId: string | null;
  competencyCount: number;
};

export interface StudentDataStore {
  /** Σ bytes of accepted Budget loans received by this Student. */
  acceptedTransfersInBytes(userId: string): Promise<number>;
  /** Σ bytes of accepted Budget loans given by this Student. */
  acceptedTransfersOutBytes(userId: string): Promise<number>;
  /** Σ bytes of this Student's stored assets. */
  usedBytes(userId: string): Promise<number>;
  /**
   * Students that may be auto-selected by Rotation: role `student`, not
   * flagged, within `tracks` when a non-empty filter is given, each carrying
   * its competency count for the completeness check applied by the caller.
   */
  rotationCandidates(tracks?: string[] | null): Promise<EligibilityCandidate[]>;
  /** A single Student's track, or null when the row is missing. */
  studentTrack(userId: string): Promise<string | null>;
}

function toBytes(rows: Array<{ total: string | null }>): number {
  return Number(rows[0]?.total ?? 0);
}

export class DrizzleStudentDataStore implements StudentDataStore {
  async acceptedTransfersInBytes(userId: string): Promise<number> {
    const rows = await db
      .select({ total: sum(budgetLoan.bytes) })
      .from(budgetLoan)
      .where(
        and(eq(budgetLoan.toUserId, userId), eq(budgetLoan.status, "accepted")),
      );
    return toBytes(rows);
  }

  async acceptedTransfersOutBytes(userId: string): Promise<number> {
    const rows = await db
      .select({ total: sum(budgetLoan.bytes) })
      .from(budgetLoan)
      .where(
        and(
          eq(budgetLoan.fromUserId, userId),
          eq(budgetLoan.status, "accepted"),
        ),
      );
    return toBytes(rows);
  }

  async usedBytes(userId: string): Promise<number> {
    const rows = await db
      .select({ total: sum(asset.bytes) })
      .from(asset)
      .where(eq(asset.studentUserId, userId));
    return toBytes(rows);
  }

  async rotationCandidates(
    tracks?: string[] | null,
  ): Promise<EligibilityCandidate[]> {
    // role=student AND not flagged (a flagged Student is off the show — never
    // surfaced by Rotation, matching the Companion list's filter), within the
    // Stage's track filter when one is set.
    const base = and(eq(user.role, "student"), eq(student.isFlagged, false));
    const where =
      tracks && tracks.length > 0
        ? and(base, inArray(student.track, tracks))
        : base;
    const rows = await db
      .select({
        userId: student.userId,
        displayName: student.displayName,
        introduction: student.introduction,
        portraitAssetId: student.portraitAssetId,
        workMediaAssetId: student.workMediaAssetId,
      })
      .from(student)
      .innerJoin(user, eq(user.id, student.userId))
      .where(where);
    if (rows.length === 0) return [];
    const comps = await db
      .select({ studentUserId: studentCompetency.studentUserId })
      .from(studentCompetency)
      .where(
        inArray(
          studentCompetency.studentUserId,
          rows.map((r) => r.userId),
        ),
      );
    const compCount = new Map<string, number>();
    for (const c of comps) {
      compCount.set(c.studentUserId, (compCount.get(c.studentUserId) ?? 0) + 1);
    }
    return rows.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      introduction: r.introduction,
      portraitAssetId: r.portraitAssetId,
      workMediaAssetId: r.workMediaAssetId,
      competencyCount: compCount.get(r.userId) ?? 0,
    }));
  }

  async studentTrack(userId: string): Promise<string | null> {
    const rows = await db
      .select({ track: student.track })
      .from(student)
      .where(eq(student.userId, userId));
    return rows[0]?.track ?? null;
  }
}

/** Minimal Student shape an in-memory test can seed. */
export type MemStudent = {
  userId: string;
  role?: "student" | "staff";
  displayName?: string;
  introduction?: string;
  track?: string;
  portraitAssetId?: string | null;
  workMediaAssetId?: string | null;
  isFlagged?: boolean;
  competencyCount?: number;
};

export type MemAsset = { studentUserId: string; bytes: number };
export type MemLoan = {
  fromUserId: string;
  toUserId: string;
  bytes: number;
  status?: string;
};

export class InMemoryStudentDataStore implements StudentDataStore {
  students: MemStudent[];
  assets: MemAsset[];
  loans: MemLoan[];

  constructor(seed?: {
    students?: MemStudent[];
    assets?: MemAsset[];
    loans?: MemLoan[];
  }) {
    this.students = seed?.students ?? [];
    this.assets = seed?.assets ?? [];
    this.loans = seed?.loans ?? [];
  }

  async acceptedTransfersInBytes(userId: string): Promise<number> {
    return this.loans
      .filter((l) => l.toUserId === userId && (l.status ?? "accepted") === "accepted")
      .reduce((n, l) => n + l.bytes, 0);
  }

  async acceptedTransfersOutBytes(userId: string): Promise<number> {
    return this.loans
      .filter((l) => l.fromUserId === userId && (l.status ?? "accepted") === "accepted")
      .reduce((n, l) => n + l.bytes, 0);
  }

  async usedBytes(userId: string): Promise<number> {
    return this.assets
      .filter((a) => a.studentUserId === userId)
      .reduce((n, a) => n + a.bytes, 0);
  }

  async rotationCandidates(
    tracks?: string[] | null,
  ): Promise<EligibilityCandidate[]> {
    const trackSet = tracks && tracks.length > 0 ? new Set(tracks) : null;
    return this.students
      .filter((s) => (s.role ?? "student") === "student")
      .filter((s) => !s.isFlagged)
      .filter((s) => !trackSet || trackSet.has(s.track ?? "IxD"))
      .map((s) => ({
        userId: s.userId,
        displayName: s.displayName ?? "",
        introduction: s.introduction ?? "",
        portraitAssetId: s.portraitAssetId ?? null,
        workMediaAssetId: s.workMediaAssetId ?? null,
        competencyCount: s.competencyCount ?? 0,
      }));
  }

  async studentTrack(userId: string): Promise<string | null> {
    const s = this.students.find((x) => x.userId === userId);
    return s ? (s.track ?? "IxD") : null;
  }
}

let store: StudentDataStore = new DrizzleStudentDataStore();

export function getStudentDataStore(): StudentDataStore {
  return store;
}

export function setStudentDataStore(impl: StudentDataStore): void {
  store = impl;
}
