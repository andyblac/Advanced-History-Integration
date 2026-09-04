import assert from "node:assert/strict";
import test from "node:test";

import { EnergyMethods } from "../custom_components/advanced_history/frontend/energy.js";

test("comparison menu enables the selected comparison type", () => {
  const calls = [];
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _energyCompareChoice: "last_year",
    _energyCollection: {
      compare: "",
      setCompare(value) {
        this.compare = value;
        calls.push(["set", value]);
      },
      refresh: () => calls.push(["refresh"]),
    },
    _beginGraphDataSourceCycle: () => calls.push(["cycle"]),
    _beginEnergyInteractionLoading: () => calls.push(["loading"]),
    _energyApplyCompareMode: (...args) => calls.push(["apply", ...args]),
    _syncY1ComparisonToggle: (active) => calls.push(["sync", active]),
  });

  context._setY1ComparisonEnabled(true);

  assert.equal(context._energyCollection.compare, "yoy");
  assert.deepEqual(calls, [
    ["cycle"],
    ["loading"],
    ["set", "yoy"],
    ["apply", "yoy", true],
    ["refresh"],
    ["sync", true],
  ]);
});

test("comparison menu clamps count and refreshes an active comparison", () => {
  const calls = [];
  const context = Object.assign(Object.create(EnergyMethods.prototype), {
    _energyCompareCount: 1,
    _energyCollection: { compare: "previous" },
    _beginGraphDataSourceCycle: () => calls.push("cycle"),
    _energyApplyCompareMode: (...args) => calls.push(args),
    _recordChange: () => calls.push("record"),
  });

  context._setY1ComparisonCount(99);

  assert.equal(context._energyCompareCount, 10);
  assert.deepEqual(calls, ["cycle", ["previous", true], "record"]);
});
