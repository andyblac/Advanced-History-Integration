"""Constants for Advanced History."""

import hashlib
import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Mapping

DOMAIN = "advanced_history"
_INTEGRATION_DIR = Path(__file__).parent
_FRONTEND_DIR = _INTEGRATION_DIR / "frontend"
# Keep manifest.json as the single editable source for the integration version.
VERSION = json.loads(
    (_INTEGRATION_DIR / "manifest.json").read_text(encoding="utf-8")
)["version"]


def _frontend_build_id() -> str:
    """Return a stable fingerprint for the complete frontend module tree."""
    digest = hashlib.sha256()
    for path in sorted(_FRONTEND_DIR.rglob("*.js")):
        digest.update(str(path.relative_to(_FRONTEND_DIR)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


PANEL_URL_PATH = "advanced-history"
PANEL_ELEMENT = "advanced-history-panel"
FRONTEND_BASE_URL = f"/advanced_history/{VERSION}-{_frontend_build_id()}"
PANEL_MODULE_URL = f"{FRONTEND_BASE_URL}/advanced-history-panel.js"
MORE_INFO_MODULE_URL = f"{FRONTEND_BASE_URL}/advanced-history-more-info.js"

CONF_TITLE = "title"
CONF_ENTRY_TYPE = "entry_type"
CONF_SIDEBAR_ICON = "sidebar_icon"
CONF_MAX_ENTITIES = "max_entities"
CONF_MAX_TABS = "max_tabs"
CONF_LARGE_RANGE_AUTOMATIC_DETAIL = "large_range_automatic_detail"
CONF_LARGE_RANGE_DETAIL_THRESHOLD_DAYS = "large_range_detail_threshold_days"
CONF_DEFAULT_HOURS = "default_hours"
CONF_GRAPH_HEIGHT = "graph_height"
CONF_INCLUDE_HIDDEN = "include_hidden"
CONF_REDIRECT_SHOW_MORE = "redirect_show_more"
CONF_REPLACE_MORE_INFO_HISTORY = "replace_more_info_history"
CONF_MORE_INFO_SHOW_DATE_PICKER = "more_info_show_date_picker"
CONF_CARD_MODULE_URL = "card_module_url"
CONF_CARD_OPTIONS = "card_options"
CARD_OPTIONS_NUMERIC_ENTITIES = "numeric_entities"
CARD_OPTIONS_STATE_ENTITIES = "state_entities"
CONF_MORE_INFO_CARD_OPTIONS = "more_info_card_options"
CONF_ENTITY_OPTIONS = "entity_options"
CONF_COMPARE = "compare"
CONF_REQUIRE_ADMIN = "require_admin"

ENTRY_TYPE_PANEL = "panel"
ENTRY_TYPE_MORE_INFO = "more_info"

DEFAULT_ENTITY_OPTIONS = {
    "show_in_legend": True,
}

DEFAULT_MORE_INFO_ENTITY_OPTIONS = {
    "line_width": 1.5,
    "show_extrema": "never",
    "show_fill": True,
    "show_points": False,
    "show_state": False,
    "smooth": True,
}

DEFAULT_CARD_OPTIONS = {
    "auto_scale_points": True,
    "include_area_names": True,
    "include_attribute_name": True,
    "show_full_period": True,
    "show_tooltip": True,
    "state_timeline_label_font_size": 14,
    "zoom_sync": True,
    "zoom_sync_group": "advanced-history-panel",
    "tooltip_sync": True,
    "tooltip_sync_group": "advanced-history-panel",
    CARD_OPTIONS_NUMERIC_ENTITIES: DEFAULT_ENTITY_OPTIONS,
    CARD_OPTIONS_STATE_ENTITIES: DEFAULT_ENTITY_OPTIONS,
}

DEFAULT_MORE_INFO_CARD_OPTIONS = {
    "auto_scale_points": True,
    "card_background_color": "transparent",
    "card_border": False,
    "card_padding": 0,
    "card_shadow": False,
    "date_picker_default_mode": "last_24h",
    "date_picker_modes": ["day", "week", "month", "year", "last_24h"],
    "height": 240,
    "include_attribute_name": True,
    "interval_picker_position": "right",
    "show_date_picker": True,
    "show_legend": False,
    "show_now_line": False,
    "show_tooltip": True,
    "state_timeline_corner_radius": 0,
    "state_timeline_label_font_size": 14,
    "x_axis_color": "var(--primary-text-color)",
    "x_axis_date_color": "var(--primary-text-color)",
    "x_axis_font_size": 12,
    "x_grid_color": "var(--divider-color)",
    "x_grid_opacity": 1,
    "x_grid_style": "solid",
    "y_axis_color": "var(--primary-text-color)",
    "y_axis_font_size": 12,
    "y_grid_color": "var(--divider-color)",
    "y_grid_opacity": 1,
    "y_grid_style": "solid",
    "entities": DEFAULT_MORE_INFO_ENTITY_OPTIONS,
}

DEFAULT_OPTIONS = {
    CONF_TITLE: "Advanced History",
    CONF_SIDEBAR_ICON: "mdi:chart-timeline-variant-shimmer",
    CONF_MAX_ENTITIES: 30,
    CONF_MAX_TABS: 10,
    CONF_LARGE_RANGE_AUTOMATIC_DETAIL: True,
    CONF_LARGE_RANGE_DETAIL_THRESHOLD_DAYS: 31,
    CONF_DEFAULT_HOURS: 24,
    CONF_GRAPH_HEIGHT: 300,
    CONF_INCLUDE_HIDDEN: False,
    CONF_CARD_MODULE_URL: "",
    CONF_CARD_OPTIONS: DEFAULT_CARD_OPTIONS,
    CONF_ENTITY_OPTIONS: {},
    CONF_REQUIRE_ADMIN: False,
}

DEFAULT_MORE_INFO_OPTIONS = {
    CONF_REPLACE_MORE_INFO_HISTORY: True,
    CONF_MORE_INFO_SHOW_DATE_PICKER: False,
    CONF_REDIRECT_SHOW_MORE: False,
    CONF_CARD_MODULE_URL: "",
    CONF_MORE_INFO_CARD_OPTIONS: DEFAULT_MORE_INFO_CARD_OPTIONS,
}


def config_entry_type(entry: Any) -> str:
    """Return the role of an Advanced History config entry."""
    configured = (
        entry.data.get(CONF_ENTRY_TYPE)
        if isinstance(entry.data, Mapping)
        else None
    )
    if configured in {ENTRY_TYPE_PANEL, ENTRY_TYPE_MORE_INFO}:
        return configured
    if entry.unique_id == f"{DOMAIN}_{ENTRY_TYPE_MORE_INFO}":
        return ENTRY_TYPE_MORE_INFO
    return ENTRY_TYPE_PANEL


def _merge_new_defaults(
    defaults: Mapping[str, Any], configured: Mapping[str, Any]
) -> dict[str, Any]:
    """Add missing defaults recursively while preserving configured values."""
    merged = deepcopy(dict(defaults))
    for key, value in configured.items():
        if (
            key in merged
            and isinstance(merged[key], Mapping)
            and isinstance(value, Mapping)
        ):
            merged[key] = _merge_new_defaults(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def options_with_defaults(options: Mapping[str, Any]) -> dict[str, Any]:
    """Apply visible config-flow defaults without replacing explicit values."""
    merged = {**deepcopy(DEFAULT_OPTIONS), **dict(options)}
    if CONF_CARD_OPTIONS in options:
        configured_card = options[CONF_CARD_OPTIONS]
        card_options = deepcopy(DEFAULT_CARD_OPTIONS)
        if isinstance(configured_card, Mapping):
            card_options = _merge_new_defaults(DEFAULT_CARD_OPTIONS, configured_card)
    else:
        card_options = deepcopy(DEFAULT_CARD_OPTIONS)
    # These have dedicated config-flow fields and must not appear twice.
    card_options.pop("height", None)
    card_options.pop("hours_to_show", None)
    merged[CONF_CARD_OPTIONS] = card_options
    return merged


def more_info_options_with_defaults(options: Mapping[str, Any]) -> dict[str, Any]:
    """Apply defaults for the independent More-Info service entry."""
    merged = {**deepcopy(DEFAULT_MORE_INFO_OPTIONS), **dict(options)}
    if CONF_MORE_INFO_CARD_OPTIONS in options:
        configured = options[CONF_MORE_INFO_CARD_OPTIONS]
        merged[CONF_MORE_INFO_CARD_OPTIONS] = deepcopy(DEFAULT_MORE_INFO_CARD_OPTIONS)
        if isinstance(configured, Mapping):
            merged[CONF_MORE_INFO_CARD_OPTIONS] = _merge_new_defaults(
                DEFAULT_MORE_INFO_CARD_OPTIONS, configured
            )
    else:
        merged[CONF_MORE_INFO_CARD_OPTIONS] = deepcopy(DEFAULT_MORE_INFO_CARD_OPTIONS)
    return merged
