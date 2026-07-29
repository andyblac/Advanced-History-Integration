const DOMAIN_STATES = {
  alarm_control_panel: [
    "disarmed",
    "arming",
    "armed_home",
    "armed_away",
    "armed_night",
    "armed_vacation",
    "armed_custom_bypass",
    "pending",
    "triggered",
  ],
  alert: ["idle", "off", "on"],
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
  lawn_mower: ["docked", "mowing", "paused", "error"],
  light: ["off", "on"],
  lock: ["locked", "locking", "unlocked", "unlocking", "jammed"],
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

export function nativeStateMap(hass, entityId) {
  const stateObj = hass?.states?.[entityId];
  if (!stateObj) return undefined;
  const domain = entityId?.split(".", 1)[0];
  let values = DOMAIN_STATES[domain];
  let useNativeColors = true;
  if (domain === "climate") values = stateObj.attributes?.hvac_modes;
  else if (domain === "water_heater") values = stateObj.attributes?.operation_list;
  else if (domain === "select" || domain === "input_select") {
    values = stateObj.attributes?.options;
    useNativeColors = false;
  }
  if (!Array.isArray(values)) return undefined;

  const states = [...new Set([
    ...values,
    stateObj.state,
    "unknown",
    "unavailable",
  ].filter(Boolean))];
  const deviceClass = stateObj.attributes?.device_class;
  return states.map((state) => ({
    value: state,
    label: hass?.formatEntityState?.(stateObj, state) || state,
    ...(useNativeColors ? { color: nativeStateColor(domain, deviceClass, state) } : {}),
  }));
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

export function stateMapLegendColor(entityId, stateMap) {
  if (!Array.isArray(stateMap)) return undefined;
  const domain = entityId?.split(".", 1)[0];
  const active = stateMap.find((entry) => String(entry?.value) === "on")
    || stateMap.find((entry) => {
      const state = String(entry?.value ?? "");
      return (
        state
        && state !== "unknown"
        && state !== "unavailable"
        && stateIsActive(domain, state)
      );
    });
  return active?.color;
}
