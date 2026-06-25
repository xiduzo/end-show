import { describe, expect, test } from "bun:test";

import {
  intentActive,
  isHiddenWhileIdle,
  visibleStudents,
} from "../src/fairness";

const idle = { searching: false, filtering: false };
const searching = { searching: true, filtering: false };
const filtering = { searching: false, filtering: true };

const list = [
  { userId: "a", hideWhenIdle: false },
  { userId: "b", hideWhenIdle: true },
];

describe("fairness visibility (ADR-0011 intent overrides fairness)", () => {
  test("idle hides the top-decile flagged Student", () => {
    expect(visibleStudents(list, idle).map((s) => s.userId)).toEqual(["a"]);
  });

  test("an active search restores everyone", () => {
    expect(visibleStudents(list, searching).map((s) => s.userId)).toEqual([
      "a",
      "b",
    ]);
  });

  test("an active filter restores everyone", () => {
    expect(visibleStudents(list, filtering)).toHaveLength(2);
  });

  test("isHiddenWhileIdle encodes the flip", () => {
    expect(isHiddenWhileIdle({ hideWhenIdle: true }, idle)).toBe(true);
    expect(isHiddenWhileIdle({ hideWhenIdle: true }, searching)).toBe(false);
    expect(isHiddenWhileIdle({ hideWhenIdle: false }, idle)).toBe(false);
  });

  test("intentActive is true when searching or filtering", () => {
    expect(intentActive(idle)).toBe(false);
    expect(intentActive(searching)).toBe(true);
    expect(intentActive(filtering)).toBe(true);
  });
});
