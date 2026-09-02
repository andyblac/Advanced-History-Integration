# Add the current panel to a dashboard

Open any graph's three-dot menu and select **Add current panel to dashboard** to turn the active panel into ordinary dashboard cards. The action exports every graph in the active panel, regardless of which graph's menu opened it.

## Placement

Advanced History opens Home Assistant's native **Add to dashboard** flow. Select an editable dashboard and view, review the card preview, and then select **Add to dashboard**. Home Assistant controls which dashboards and views the current user may edit.

If Home Assistant's native placement flow is unavailable, Advanced History shows copyable YAML. When the panel has two graphs, the fallback YAML uses a vertical stack so both cards can be copied in one operation.

## What is exported

Each visible graph becomes an independent `custom:statistics-graph-chart-card` configuration. Numeric and state-history graphs are exported together. The export preserves:

- resolved entities and selected attributes;
- entity options, colours, primary and secondary axes, and state maps;
- comparisons, grouping, aggregation, detail, and graph display settings; and
- the current panel's sensible date-picker mode when the card supports it.

Every export operation creates a new date-picker group. Cards exported together share that group and use the Statistics Graph Chart Card's internal date picker, so changing one picker keeps the exported graphs synchronized.

If the panel contains deselected targets, the suggestion dialog shows **Hide entities on load**. It is disabled by default, leaving those rows at `enabled: false` so the exported dashboard card matches the panel. Turn the option on to export them with `enabled: true` and `auto_hide: true`: they start without a plotted series. Existing card- and entity-level legend settings are preserved, so hidden entities appear dimmed only when the panel already used the legend for them. No deselected entity is omitted. The YAML fallback provides the same choice.

## Snapshot behaviour

Exported cards are snapshots. They do not refer back to Advanced History, its target pickers, or the Energy date picker. Later panel changes do not alter cards already added to a dashboard.

Advanced History removes `energy_date_sync`, `energy_collection_key`, calculated state-timeline heights, temporary grid sizing, and other panel-only placement values before opening the dashboard flow. The exported cards do not require Orbit Cards and remain editable in the Statistics Graph Chart Card visual editor.
