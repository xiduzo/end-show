import { describe, expect, test } from "bun:test";

import {
  SOFT_BAND_MULTIPLIER,
  budgetBand,
  budgetSoftWarning,
} from "../src/budgetBand";

const B = 100;

describe("budgetBand (CONTEXT.md three-zone policy)", () => {
  test("at or under budget is ok", () => {
    expect(budgetBand(0, B).band).toBe("ok");
    expect(budgetBand(B, B).band).toBe("ok");
  });

  test("over budget but within 1.20x is soft — upload still allowed", () => {
    expect(budgetBand(B + 1, B).band).toBe("soft");
    expect(budgetBand(B * SOFT_BAND_MULTIPLIER, B).band).toBe("soft");
  });

  test("past 1.20x is hard", () => {
    expect(budgetBand(B * SOFT_BAND_MULTIPLIER + 1, B).band).toBe("hard");
  });

  test("zero effective budget: nothing used is ok, any usage is hard", () => {
    expect(budgetBand(0, 0).band).toBe("ok");
    expect(budgetBand(1, 0).band).toBe("hard");
  });

  test("hardRemainingBytes is the headroom to the 1.20x ceiling", () => {
    expect(budgetBand(B, B).hardRemainingBytes).toBe(20);
    expect(budgetBand(B * 1.2, B).hardRemainingBytes).toBe(0);
  });

  test("soft warning escalates and is null outside the soft band", () => {
    expect(budgetSoftWarning(budgetBand(B, B))).toBeNull(); // ok
    expect(budgetSoftWarning(budgetBand(B * 1.5, B))).toBeNull(); // hard
    const gentle = budgetSoftWarning(budgetBand(B * 1.03, B));
    const stern = budgetSoftWarning(budgetBand(B * 1.18, B));
    expect(gentle).not.toBeNull();
    expect(stern).not.toBeNull();
    expect(gentle).not.toBe(stern); // tone escalates toward the ceiling
  });
});
