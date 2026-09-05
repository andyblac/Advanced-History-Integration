const dashboardScaleSources = new Map();
const dashboardScaleSourceOwners = new Map();

export function dashboardPrimaryScaleOptions(config) {
  const numeric = (config?.sgcc_configs || []).find(
    (item) => item && item.chart_mode !== "state_timeline",
  ) || {};
  return {
    autoScaleDefined: Object.prototype.hasOwnProperty.call(numeric, "auto_scale_points"),
    autoScalePoints: numeric.auto_scale_points,
    groupByDefined: Object.prototype.hasOwnProperty.call(numeric, "group_by"),
    groupBy: numeric.group_by,
  };
}

export function scaleOptionsFromPicker(label, value = "", automaticValue = null) {
  const text = String(label || "").trim();
  if (!text) return null;
  const automatic = typeof automaticValue === "boolean"
    ? automaticValue
    : /^auto(?:\s*\(|$)/i.test(text);
  const displayed = automatic
    ? text.match(/^auto\s*\((.+)\)$/i)?.[1] || ""
    : text;
  const nativeValue = String(value || "").trim();
  const normalized = String(
    nativeValue && !/^auto$/i.test(nativeValue) ? nativeValue : displayed,
  ).trim().toLowerCase();
  let groupBy = normalized;
  const hours = normalized.match(/^(\d+)\s*(?:h|hours?)$/i);
  if (hours) groupBy = `${hours[1]}h`;
  else if (["day", "daily", "date"].includes(normalized)) groupBy = "date";
  else if (["week", "weekly"].includes(normalized)) groupBy = "week";
  else if (["month", "monthly"].includes(normalized)) groupBy = "month";
  if (!groupBy || groupBy === "auto") return null;
  return {
    autoScaleDefined: true,
    autoScalePoints: automatic,
    groupByDefined: true,
    groupBy,
  };
}

function notifyScaleSourceGroup(group) {
  const members = dashboardScaleSources.get(group);
  if (!members) return;
  const primary = [...members.values()].find((member) => member.primary);
  for (const member of members.values()) {
    if (!member.primary) member.notify(primary?.options || null);
  }
}

export function registerDashboardScaleSource(
  owner,
  group,
  primary,
  options,
  notify,
) {
  if (!group || typeof notify !== "function") return;
  const previousGroup = dashboardScaleSourceOwners.get(owner);
  if (previousGroup && previousGroup !== group) releaseDashboardScaleSource(owner);
  let members = dashboardScaleSources.get(group);
  if (!members) {
    members = new Map();
    dashboardScaleSources.set(group, members);
  }
  members.set(owner, { primary, options, notify });
  dashboardScaleSourceOwners.set(owner, group);
  notifyScaleSourceGroup(group);
}

export function releaseDashboardScaleSource(owner) {
  const group = dashboardScaleSourceOwners.get(owner);
  if (!group) return;
  dashboardScaleSourceOwners.delete(owner);
  const members = dashboardScaleSources.get(group);
  if (!members?.delete(owner)) return;
  if (members.size) notifyScaleSourceGroup(group);
  else dashboardScaleSources.delete(group);
}
