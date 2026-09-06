import { climateHistoryAttributes } from "./climate.js";

export const NATIVE_HISTORY_ATTRIBUTES = {
  humidifier: ["current_humidity", "humidity"],
  water_heater: ["current_temperature", "temperature"],
};

export function nativeHistoryAttributes(entityId, stateObj) {
  const domain = entityId?.split(".")[0];
  if (domain === "climate") return climateHistoryAttributes(stateObj);
  const supported = NATIVE_HISTORY_ATTRIBUTES[domain];
  if (!stateObj || !supported) return [];
  const attributes = stateObj.attributes || {};
  return supported.filter((attribute) =>
    Object.prototype.hasOwnProperty.call(attributes, attribute)
  );
}

export function nativeHistoryAttributeColor(host, entityId, stateObj, attribute) {
  const index = nativeHistoryAttributes(entityId, stateObj).indexOf(attribute);
  if (index < 0 || typeof getComputedStyle !== "function") return undefined;
  const style = getComputedStyle(host);
  const position = index + 1;
  return style.getPropertyValue(`--graph-color-${position}`).trim()
    || style.getPropertyValue(`--color-${position}`).trim()
    || undefined;
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
