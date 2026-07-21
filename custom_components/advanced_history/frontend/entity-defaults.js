export const CARD_DEFAULT_AGGREGATE = "avg";

export function automaticEntityOptions(stateObj, mode = "timeline") {
  if (mode === "state_timeline") return {};

  const stateClass = stateObj?.attributes?.state_class;
  if (stateClass === "total" || stateClass === "total_increasing") {
    return { aggregate_func: "last" };
  }

  return {};
}
