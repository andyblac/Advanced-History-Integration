import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardPrimaryScaleOptions,
  dashboardScaleGroupOwners,
  registerDashboardScaleSource,
  releaseDashboardScaleSource,
  scaleOptionsFromPicker,
} from "../custom_components/advanced_history/frontend/dashboard-scale-mode.js";

test("date-picker followers receive the primary card scale options", () => {
  const primary = {};
  const follower = {};
  const received = [];
  const options = dashboardPrimaryScaleOptions({
    sgcc_configs: [{ auto_scale_points: true, group_by: "interval" }],
  });

  registerDashboardScaleSource(
    follower,
    "energy",
    false,
    dashboardPrimaryScaleOptions({ sgcc_configs: [{ group_by: "6h" }] }),
    (value) => received.push(value),
  );
  assert.equal(received.at(-1), null);

  registerDashboardScaleSource(primary, "energy", true, options, () => {});
  assert.deepEqual(received.at(-1), options);
  assert.deepEqual(dashboardScaleGroupOwners("energy"), [follower, primary]);

  releaseDashboardScaleSource(primary);
  assert.equal(received.at(-1), null);
  releaseDashboardScaleSource(follower);
  assert.deepEqual(dashboardScaleGroupOwners("energy"), []);
});

test("rendered Auto picker labels expose their resolved SGCC grouping", () => {
  assert.deepEqual(scaleOptionsFromPicker("Auto (Interval)", "auto"), {
    autoScaleDefined: true,
    autoScalePoints: true,
    groupByDefined: true,
    groupBy: "interval",
  });
  assert.deepEqual(scaleOptionsFromPicker("Auto (6H)", "auto"), {
    autoScaleDefined: true,
    autoScalePoints: true,
    groupByDefined: true,
    groupBy: "6h",
  });
  assert.deepEqual(scaleOptionsFromPicker("2 Hours", "2h"), {
    autoScaleDefined: true,
    autoScalePoints: false,
    groupByDefined: true,
    groupBy: "2h",
  });
  assert.deepEqual(scaleOptionsFromPicker("Automatisch (Intervall)", "interval", true), {
    autoScaleDefined: true,
    autoScalePoints: true,
    groupByDefined: true,
    groupBy: "interval",
  });
});
