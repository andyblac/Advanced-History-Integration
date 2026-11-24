const DOMAIN_STATES = {
  alarm_control_panel: [
    "disarmed",
    "arming",
    "armed_home",
    "armed_away",
    "armed_night",
    "armed_vacation",
    "armed_custom_bypass",
    "disarming",
    "pending",
    "triggered",
  ],
  alert: ["idle", "off", "on"],
  assist_satellite: ["idle", "listening", "responding", "processing"],
  automation: ["off", "on"],
  binary_sensor: ["off", "on"],
  calendar: ["off", "on"],
  camera: ["idle", "recording", "streaming"],
  cover: ["closed", "closing", "open", "opening"],
  device_tracker: ["not_home", "home"],
  fan: ["off", "on"],
  group: ["off", "on", "not_home", "home", "closed", "open", "locked", "unlocked", "ok", "problem"],
  humidifier: ["off", "on"],
  input_boolean: ["off", "on"],
  lawn_mower: ["docked", "mowing", "paused", "returning", "error"],
  light: ["off", "on"],
  lock: ["locked", "locking", "unlocked", "unlocking", "opening", "open", "jammed"],
  media_player: ["off", "on", "idle", "playing", "paused", "standby", "buffering"],
  person: ["not_home", "home"],
  plant: ["ok", "problem"],
  remote: ["off", "on"],
  schedule: ["off", "on"],
  script: ["off", "on"],
  siren: ["off", "on"],
  sun: ["below_horizon", "above_horizon"],
  switch: ["off", "on"],
  timer: ["idle", "active", "paused"],
  update: ["off", "on"],
  vacuum: ["docked", "idle", "cleaning", "returning", "paused", "error"],
  valve: ["closed", "closing", "open", "opening"],
  weather: [
    "clear-night",
    "cloudy",
    "exceptional",
    "fog",
    "hail",
    "lightning",
    "lightning-rainy",
    "partlycloudy",
    "pouring",
    "rainy",
    "snowy",
    "snowy-rainy",
    "sunny",
    "windy",
    "windy-variant",
  ],
};

function cssVariableChain(properties) {
  return properties.reduceRight(
    (fallback, property) => `var(${property}${fallback ? `, ${fallback}` : ""})`,
    "",
  );
}

function stateKey(value) {
  return String(value).replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
}

function graphPaletteColor(index) {
  const position = (index % 54) + 1;
  return `var(--graph-color-${position}, var(--color-${position}))`;
}

// HA assigns otherwise uncoloured states a shared graph-palette colour when
// first encountered. Keep assignments stable across entities and renders.
const genericStateColors = new Map();

export function timelineStateColors(datasets, entityId, labels) {
  const colors = new Map();
  for (const dataset of Array.isArray(datasets) ? datasets : []) {
    if (dataset.id && dataset.id !== entityId) continue;
    for (const segment of dataset.data || []) {
      const value = segment?.value;
      if (!Array.isArray(value) || value[0] !== entityId) continue;
      const state = labels.get(value[3]);
      const color = value[4] || segment.itemStyle?.color;
      if (state && typeof color === "string" && color) colors.set(state, color);
    }
  }
  return colors;
}

function genericStateColor(state) {
  if (!genericStateColors.has(state)) {
    genericStateColors.set(state, graphPaletteColor(genericStateColors.size));
  }
  return genericStateColors.get(state);
}

function categoricalStateColor(domain, deviceClass, state, fallback) {
  const key = stateKey(state);
  const properties = deviceClass
    ? [`--state-${domain}-${stateKey(deviceClass)}-${key}-color`]
    : [];
  properties.push(`--state-${domain}-${key}-color`);
  return properties.reduceRight(
    (color, property) => `var(${property}, ${color})`,
    fallback,
  );
}

const BOOLEAN_STATE_COLORS = Object.freeze({
  false: "var(--state-inactive-color, var(--disabled-text-color, #9e9e9e))",
  true: "var(--state-active-color, var(--success-color, #43a047))",
});

export function withBooleanStateColors(
  stateMap,
  activeColor = null,
  replaceGeneratedActive = false,
) {
  if (!Array.isArray(stateMap)) return stateMap;
  return stateMap.map((entry) => {
    const value = String(entry?.value).toLowerCase();
    const generatedColor = BOOLEAN_STATE_COLORS[value];
    if (
      !entry
      || !generatedColor
    ) return entry;
    const hasColor = Object.prototype.hasOwnProperty.call(entry, "color");
    if (hasColor && !(replaceGeneratedActive && value === "true" && entry.color === generatedColor)) {
      return entry;
    }
    return {
      ...entry,
      color: value === "true" && activeColor ? activeColor : generatedColor,
    };
  });
}

function stateIsActive(domain, state) {
  if (state === "unavailable" || state === "unknown") return false;
  if (state === "off" && domain !== "alert") return false;
  if (domain === "alarm_control_panel") return state !== "disarmed";
  if (domain === "alert") return state !== "idle";
  if (domain === "cover") return state !== "closed";
  if (domain === "device_tracker" || domain === "person") return state !== "not_home";
  if (domain === "lawn_mower") return !["docked", "paused"].includes(state);
  if (domain === "lock") return state !== "locked";
  if (domain === "media_player") return state !== "standby";
  if (domain === "vacuum") return !["idle", "docked", "paused"].includes(state);
  if (domain === "valve") return state !== "closed";
  if (domain === "plant") return state === "problem";
  if (domain === "group") return ["on", "home", "open", "locked", "problem"].includes(state);
  if (domain === "timer") return state === "active";
  if (domain === "camera") return state === "streaming";
  return true;
}

export function nativeStateColor(domain, deviceClass, state) {
  if (state === "unavailable") {
    return "var(--history-unavailable-color, var(--state-unavailable-color))";
  }
  if (state === "unknown") {
    return "var(--history-unknown-color, var(--state-inactive-color))";
  }
  const key = stateKey(state);
  const properties = [];
  if (deviceClass) {
    properties.push(`--state-${domain}-${stateKey(deviceClass)}-${key}-color`);
  }
  properties.push(
    `--state-${domain}-${key}-color`,
    `--state-${domain}-${stateIsActive(domain, state) ? "active" : "inactive"}-color`,
    `--state-${stateIsActive(domain, state) ? "active" : "inactive"}-color`,
  );
  return cssVariableChain(properties);
}

export function nativeStateMap(
  hass,
  entityId,
  observedStates = [],
  observedColors = new Map(),
) {
  const stateObj = hass?.states?.[entityId];
  if (!stateObj) return undefined;
  const domain = entityId?.split(".", 1)[0];
  let values = DOMAIN_STATES[domain];
  let paletteValues;
  if (domain === "climate") values = stateObj.attributes?.hvac_modes;
  else if (domain === "water_heater") values = stateObj.attributes?.operation_list;
  else if (
    domain === "select"
    || domain === "input_select"
    || (domain === "sensor" && stateObj.attributes?.device_class === "enum")
  ) {
    values = stateObj.attributes?.options;
    paletteValues = values;
  } else if (domain === "sensor") {
    values = [...new Set([
      ...observedStates,
      stateObj.state,
      ...(["on", "off"].includes(stateObj.state) ? ["on", "off"] : []),
    ].filter(Boolean))];
  }
  if (!Array.isArray(values)) return undefined;

  const states = [...new Set([
    ...values,
    stateObj.state,
    "unknown",
    "unavailable",
  ].filter(Boolean))];
  const deviceClass = stateObj.attributes?.device_class;
  const categorical = domain === "sensor" || domain === "select" || domain === "input_select";
  return states.map((state) => {
    const observedColor = observedColors.get(state);
    const exceptional = state === "unknown" || state === "unavailable";
    const paletteIndex = paletteValues?.indexOf(state) ?? -1;
    const fallback = !exceptional && categorical
      ? observedColor
        || (paletteIndex >= 0 ? graphPaletteColor(paletteIndex) : genericStateColor(state))
      : null;
    return {
      value: state,
      label: hass?.formatEntityState?.(stateObj, state) || state,
      color: observedColor || (fallback
        ? categoricalStateColor(domain, deviceClass, state, fallback)
        : nativeStateColor(domain, deviceClass, state)),
    };
  });
}

export function mergeStateMaps(nativeMap, configuredMap) {
  if (!Array.isArray(nativeMap)) return configuredMap;
  if (!Array.isArray(configuredMap)) return nativeMap;

  const configuredByValue = new Map(
    configuredMap
      .filter((entry) => entry && Object.prototype.hasOwnProperty.call(entry, "value"))
      .map((entry) => [String(entry.value), entry])
  );
  const merged = nativeMap.map((entry) => {
    const configured = configuredByValue.get(String(entry.value));
    if (!configured) return entry;
    configuredByValue.delete(String(entry.value));
    return { ...entry, ...configured };
  });
  return [...merged, ...configuredByValue.values()];
}
