export const CARD_TAG = "statistics-graph-chart-card";
export const ADVANCED_HISTORY_CARD_TAG = "advanced-history-sgcc-card";
export const ADVANCED_HISTORY_CARD_TYPE = `custom:${ADVANCED_HISTORY_CARD_TAG}`;
export const ADVANCED_HISTORY_CARD_SCHEMA = 1;
export const DASHBOARD_SYNC_GROUP_KEYS = [
  "date_picker_group",
  "interval_picker_group",
  "pph_picker_group",
  "group_by_picker_group",
  "tooltip_sync_group",
  "zoom_sync_group",
  "scroll_sync_group",
];
export const DASHBOARD_STORED_SGCC_OMIT_KEYS = [
  "energy_date_sync",
  "energy_collection_key",
  "show_date_picker",
  "date_picker_position",
  "date_picker_nav_position",
  "date_picker_shortcuts_position",
  "date_picker_modes",
  "date_picker_default_mode",
  "date_picker_step",
  "show_interval_picker",
  "interval_picker_position",
  "interval_options",
  "grid_options",
];
export const DASHBOARD_SNAPSHOT_SGCC_KEYS = [
  "card_options",
  "entity_options",
  "attribute_selection",
  "default_hours",
  "source_graph_height",
];
export const DASHBOARD_SNAPSHOT_SOURCE_KEYS = [
  "source_bookmark_id",
  "source_external_bookmark",
  "source_external_bookmark_owner_id",
  "source_external_bookmark_id",
];
export const CARD_RESOURCE_MATCH = "statistics-graph-chart-card";
export const CARD_DEFAULT_MODULE_URLS = [
  "/hacsfiles/Statistics-Graph-Chart-Card/statistics-graph-chart-card.js",
  "/hacsfiles/statistics-graph-chart-card/statistics-graph-chart-card.js",
];
export const CARD_HACS_INSTALL_URL = "https://my.home-assistant.io/redirect/hacs_repository/?owner=cataseven&repository=Statistics-Graph-Chart-Card&category=plugin";
export const STORAGE_KEY = "advanced-history-panel.targets";
export const BOOKMARKS_STORAGE_KEY = "advanced-history-panel.bookmarks.v1";
export const BOOKMARKS_DIRTY_STORAGE_KEY = "advanced-history-panel.bookmarks-dirty.v1";
export const BOOKMARKS_LIMIT = 100;
export const HISTORY_STORAGE_KEY = "advanced-history-panel.history.v1";
export const HISTORY_LIMIT = 10;
export const CURRENT_SNAPSHOT_STORAGE_KEY = "advanced-history-panel.current-snapshot.v1";
export const UNDO_STORAGE_KEY = "advanced-history-panel.undo.v1";
export const REDO_STORAGE_KEY = "advanced-history-panel.redo.v1";
export const PANEL_TABS_STORAGE_KEY = "advanced-history-panel.tabs.v1";
export const DATE_PICKER_AUTO_HIDE_STORAGE_KEY = "advanced-history-panel.date-picker-auto-hide.v1";
// Schema 2 added stable per-panel metadata. Retired collection keys are
// stripped while loading older records.
export const PANEL_TABS_SCHEMA = 2;
export const UNDO_LIMIT = 50;
export const SHARE_QUERY_PARAM = "chart";
export const CARD_HANDOFF_QUERY_PARAM = "card_handoff";
export const CARD_HANDOFF_STORAGE_PREFIX = "advanced-history.card-handoff.v1.";
export const CARD_HANDOFF_SCHEMA = 1;
