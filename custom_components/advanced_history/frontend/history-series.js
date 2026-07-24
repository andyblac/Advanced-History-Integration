export const NATIVE_HISTORY_ATTRIBUTES = {
  climate: ["current_temperature", "temperature", "target_temp_low", "target_temp_high"],
  humidifier: ["current_humidity", "humidity"],
  water_heater: ["current_temperature", "temperature"],
};

export function nativeHistoryAttributes(entityId, stateObj) {
  const domain = entityId?.split(".")[0];
  const supported = NATIVE_HISTORY_ATTRIBUTES[domain];
  if (!stateObj || !supported) return [];
  const attributes = stateObj.attributes || {};
  let names = supported.filter((attribute) =>
    Object.prototype.hasOwnProperty.call(attributes, attribute)
  );

  // Native History uses either the single target temperature or the
  // high/low target range. Do not render all three at the same time.
  if (domain === "climate") {
    const hasRange = names.includes("target_temp_low") || names.includes("target_temp_high");
    names = hasRange
      ? names.filter((attribute) => attribute !== "temperature")
      : names.filter((attribute) =>
        attribute !== "target_temp_low" && attribute !== "target_temp_high"
      );
  }
  return names;
}

export function historyAttributeDisplayName(hass, entityId, attribute) {
  const domain = entityId?.split(".")[0];
  const key = `component.${domain}.entity_component._.state_attributes.${attribute}.name`;
  const translated = hass?.localize?.(key);
  return translated || attribute
    .split(".")
    .pop()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function historyAttributeUnit(hass, entityId) {
  const domain = entityId?.split(".")[0];
  if (["climate", "water_heater"].includes(domain)) {
    return hass?.config?.unit_system?.temperature;
  }
  if (domain === "humidifier") return "%";
  return undefined;
}
