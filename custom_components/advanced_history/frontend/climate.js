const CLIMATE_HISTORY_ATTRIBUTES = [
  "current_temperature",
  "temperature",
  "target_temp_low",
  "target_temp_high",
];

const CLIMATE_MODE_COLORS = {
  auto: "var(--state-climate-auto-color, var(--green-color, #4caf50))",
  cool: "var(--state-climate-cool-color, var(--blue-color, #2196f3))",
  dry: "var(--state-climate-dry-color, var(--orange-color, #ff9800))",
  fan_only: "var(--state-climate-fan_only-color, var(--cyan-color, #00bcd4))",
  heat: "var(--state-climate-heat-color, var(--deep-orange-color, #ff6f22))",
  heat_cool: "var(--state-climate-heat-cool-color, var(--amber-color, #ffc107))",
};

export const CLIMATE_MODE_ANNOTATION_PREFIX = "advanced-history-climate-mode:";

export function climateHistoryAttributes(stateObj) {
  if (!stateObj) return [];
  const attributes = stateObj.attributes || {};
  const names = CLIMATE_HISTORY_ATTRIBUTES.filter((attribute) => (
    Object.prototype.hasOwnProperty.call(attributes, attribute)
  ));
  const hasTargetRange = names.includes("target_temp_low")
    || names.includes("target_temp_high");
  return hasTargetRange
    ? names.filter((attribute) => attribute !== "temperature")
    : names.filter((attribute) => (
      attribute !== "target_temp_low" && attribute !== "target_temp_high"
    ));
}

export function isClimateModeAnnotation(annotation) {
  return annotation?.advanced_history_climate_mode === true
    || String(annotation?.id || "").startsWith(CLIMATE_MODE_ANNOTATION_PREFIX);
}

export function withoutClimateModeAnnotations(annotations) {
  return Array.isArray(annotations)
    ? annotations.filter((annotation) => !isClimateModeAnnotation(annotation))
    : [];
}

export function climateModeAnnotations(entityIds) {
  const climateEntities = [...new Set(
    (Array.isArray(entityIds) ? entityIds : [entityIds])
      .filter((entityId) => String(entityId || "").startsWith("climate.")),
  )];
  return climateEntities.flatMap((entityId) => (
    Object.entries(CLIMATE_MODE_COLORS).map(([state, color]) => ({
      id: `${CLIMATE_MODE_ANNOTATION_PREFIX}${entityId}:${state}`,
      advanced_history_climate_mode: true,
      type: "span",
      entity: entityId,
      state,
      color,
      opacity: 0.15,
    }))
  ));
}

export function withClimateModeAnnotations(config, entityIds) {
  const configured = withoutClimateModeAnnotations(config?.annotations);
  const annotations = [...configured, ...climateModeAnnotations(entityIds)];
  const result = { ...config };
  if (annotations.length) result.annotations = annotations;
  else delete result.annotations;
  return result;
}
