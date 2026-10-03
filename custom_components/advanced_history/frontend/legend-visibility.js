function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function seriesKey(row) {
  const entity = typeof row === "string" ? row : row?.entity || row?.statistic_id;
  const attribute = typeof row === "object" ? row?.attribute : null;
  return attribute ? `${entity}::${attribute}` : entity;
}

export function configsWithToggledLegendHideOnLoad(
  configs,
  cardIndex,
  renderedEntities,
  legendId,
  hidden = null,
) {
  const next = clone(configs || []);
  const config = next[cardIndex];
  if (!config || !Array.isArray(config.entities) || !Array.isArray(renderedEntities)) {
    return next;
  }
  const separator = String(legendId || "").lastIndexOf("__");
  const renderedIndex = separator >= 0
    ? Number.parseInt(String(legendId).slice(separator + 2), 10)
    : Number.NaN;
  const rendered = renderedEntities[renderedIndex];
  if (!rendered || !Number.isInteger(renderedIndex)) return next;

  const comparison = rendered._compareOf != null;
  const mainRenderedIndex = comparison
    ? Number.parseInt(rendered._compareOf, 10)
    : renderedIndex;
  const main = renderedEntities[mainRenderedIndex];
  const key = seriesKey(main);
  if (!main || !key || !Number.isInteger(mainRenderedIndex)) return next;
  const occurrence = renderedEntities.slice(0, mainRenderedIndex + 1).filter(
    (row) => row?._compareOf == null && seriesKey(row) === key,
  ).length - 1;
  let seen = 0;
  const storedIndex = config.entities.findIndex((raw) => {
    if (seriesKey(raw) !== key) return false;
    if (seen === occurrence) return true;
    seen += 1;
    return false;
  });
  if (storedIndex < 0) return next;
  const raw = config.entities[storedIndex];
  const stored = typeof raw === "string" ? { entity: raw } : clone(raw);

  if (!comparison) {
    const nextHidden = hidden == null ? stored.auto_hide !== true : hidden;
    if (nextHidden) stored.auto_hide = true;
    else delete stored.auto_hide;
    config.entities[storedIndex] = stored;
    return next;
  }

  const comparisonIndexes = renderedEntities.flatMap((row, index) => (
    Number.parseInt(row?._compareOf, 10) === mainRenderedIndex ? [index] : []
  ));
  const comparisonIndex = comparisonIndexes.indexOf(renderedIndex);
  if (comparisonIndex < 0) return next;
  const values = Array.isArray(stored.compare) ? clone(stored.compare) : [clone(stored.compare)];
  const value = values[comparisonIndex];
  if (value == null || value === false) return next;
  const option = value === true
    ? {}
    : typeof value === "string"
      ? { period: value }
      : clone(value);
  if (!option || typeof option !== "object" || Array.isArray(option)) return next;
  const nextHidden = hidden == null ? option.hide_on_load !== true : hidden;
  if (nextHidden) option.hide_on_load = true;
  else delete option.hide_on_load;
  values[comparisonIndex] = option;
  stored.compare = Array.isArray(stored.compare) ? values : option;
  config.entities[storedIndex] = stored;
  return next;
}
