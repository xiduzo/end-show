import { describe, expect, test } from "bun:test";

import { InMemoryStudentDataStore } from "../src/studentDataStore";

describe("StudentDataStore.rotationCandidates", () => {
  test("excludes flagged Students — a flag takes them off the show entirely", async () => {
    const store = new InMemoryStudentDataStore({
      students: [{ userId: "ok" }, { userId: "flagged", isFlagged: true }],
    });
    const ids = (await store.rotationCandidates()).map((c) => c.userId);
    expect(ids).toContain("ok");
    expect(ids).not.toContain("flagged");
  });

  test("excludes non-student roles", async () => {
    const store = new InMemoryStudentDataStore({
      students: [{ userId: "s" }, { userId: "staff", role: "staff" }],
    });
    const ids = (await store.rotationCandidates()).map((c) => c.userId);
    expect(ids).toEqual(["s"]);
  });

  test("filters by track only when a non-empty filter is given", async () => {
    const store = new InMemoryStudentDataStore({
      students: [
        { userId: "a", track: "IxD" },
        { userId: "b", track: "DFT" },
      ],
    });
    expect((await store.rotationCandidates(["DFT"])).map((c) => c.userId)).toEqual(
      ["b"],
    );
    expect(
      (await store.rotationCandidates()).map((c) => c.userId).sort(),
    ).toEqual(["a", "b"]);
  });
});
