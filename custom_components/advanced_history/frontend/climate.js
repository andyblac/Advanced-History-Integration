const CLIMATE_HISTORY_ATTRIBUTES = [
  "current_temperature",
  "temperature",
  "target_temp_low",
  "target_temp_high",
];

const CLIMATE_ACTION_COLORS = {
  cooling: "var(--state-climate-cool-color, var(--blue-color, #2196f3))",
  defrosting: "var(--state-climate-heat-color, var(--deep-orange-color, #ff6f22))",
  drying: "var(--state-climate-dry-color, var(--orange-color, #ff9800))",
  fan: "var(--state-climate-fan_only-color, var(--cyan-color, #00bcd4))",
  heating: "var(--state-climate-heat-color, var(--deep-orange-color, #ff6f22))",
  preheating: "var(--state-climate-heat-color, var(--deep-orange-color, #ff6f22))",
};

export const CLIMATE_ACTION_ANNOTATION_PREFIX = "advanced-history-climate-action:";
const LEGACY_CLIMATE_MODE_ANNOTATION_PREFIX = "advanced-history-climate-mode:";

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

export function isClimateActionAnnotation(annotation) {
  const id = String(annotation?.id || "");
  return annotation?.advanced_history_climate_action === true
    || annotation?.advanced_history_climate_mode === true
    || id.startsWith(CLIMATE_ACTION_ANNOTATION_PREFIX)
    || id.startsWith(LEGACY_CLIMATE_MODE_ANNOTATION_PREFIX);
}

export function withoutClimateActionAnnotations(annotations) {
  return Array.isArray(annotations)
    ? annotations.filter((annotation) => !isClimateActionAnnotation(annotation))
    : [];
}

export function climateActionAnnotations(entityIds) {
  const climateEntities = [...new Set(
    (Array.isArray(entityIds) ? entityIds : [entityIds])
      .map((entity) => {
        if (entity && typeof entity === "object") {
          return entity.enabled === false ? null : entity.entity;
        }
        return entity;
      })
      .filter((entityId) => String(entityId || "").startsWith("climate.")),
  )];
  return climateEntities.flatMap((entityId) => (
    Object.entries(CLIMATE_ACTION_COLORS).map(([state, color]) => ({
      id: `${CLIMATE_ACTION_ANNOTATION_PREFIX}${entityId}:${state}`,
      advanced_history_climate_action: true,
      type: "span",
      entity: entityId,
      attribute: "hvac_action",
      state,
      color,
      opacity: 0.15,
    }))
  ));
}

export function withClimateActionAnnotations(config, entityIds) {
  const configured = withoutClimateActionAnnotations(config?.annotations);
  const annotations = [...configured, ...climateActionAnnotations(entityIds)];
  const result = { ...config };
  if (annotations.length) result.annotations = annotations;
  else delete result.annotations;
  return result;
}
