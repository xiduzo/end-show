import { afterEach, describe, expect, test } from "bun:test";

import { computeBudget } from "../src/budget";
import {
  DrizzleStudentDataStore,
  InMemoryStudentDataStore,
  setStudentDataStore,
} from "../src/studentDataStore";

afterEach(() => setStudentDataStore(new DrizzleStudentDataStore()));

describe("computeBudget (StudentDataStore seam)", () => {
  test("effective = default + accepted-in − accepted-out; remaining subtracts usage", async () => {
    setStudentDataStore(
      new InMemoryStudentDataStore({
        assets: [{ studentUserId: "u", bytes: 5_000_000 }],
        loans: [
          { fromUserId: "x", toUserId: "u", bytes: 2_000_000, status: "accepted" },
          { fromUserId: "u", toUserId: "y", bytes: 1_000_000, status: "accepted" },
          // pending loan must not count toward the effective budget
          { fromUserId: "z", toUserId: "u", bytes: 9_000_000, status: "pending" },
        ],
      }),
    );

    const b = await computeBudget("u");

    expect(b.transferredInBytes).toBe(2_000_000);
    expect(b.transferredOutBytes).toBe(1_000_000);
    expect(b.usedBytes).toBe(5_000_000);
    expect(b.effectiveBudgetBytes).toBe(b.defaultBytes + 1_000_000);
    expect(b.remainingBytes).toBe(b.defaultBytes + 1_000_000 - 5_000_000);
  });

  test("no transfers, no assets → full default budget, nothing used", async () => {
    setStudentDataStore(new InMemoryStudentDataStore({}));
    const b = await computeBudget("lonely");
    expect(b.effectiveBudgetBytes).toBe(b.defaultBytes);
    expect(b.usedBytes).toBe(0);
    expect(b.remainingBytes).toBe(b.defaultBytes);
  });
});
