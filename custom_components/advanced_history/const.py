"""Constants for Advanced History."""

import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Mapping

DOMAIN = "advanced_history"
# Keep manifest.json as the single editable source for the integration version.
VERSION = json.loads(
    Path(__file__).with_name("manifest.json").read_text(encoding="utf-8")
)["version"]

PANEL_URL_PATH = "advanced-history"
PANEL_ELEMENT = "advanced-history-panel"
PANEL_MODULE_URL = f"/advanced_history/advanced-history-panel.js?v={VERSION}"
REDIRECT_MODULE_URL = f"/advanced_history/advanced-history-redirect.js?v={VERSION}"

CONF_TITLE = "title"
CONF_ENTRY_TYPE = "entry_type"
CONF_SIDEBAR_ICON = "sidebar_icon"
CONF_MAX_ENTITIES = "max_entities"
CONF_DEFAULT_HOURS = "default_hours"
CONF_GRAPH_HEIGHT = "graph_height"
CONF_INCLUDE_HIDDEN = "include_hidden"
CONF_REDIRECT_SHOW_MORE = "redirect_show_more"
CONF_REPLACE_MORE_INFO_HISTORY = "replace_more_info_history"
CONF_MORE_INFO_SHOW_DATE_PICKER = "more_info_show_date_picker"
CONF_CARD_MODULE_URL = "card_module_url"
CONF_CARD_OPTIONS = "card_options"
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
    "include_area_on_duplicate_names": True,
    "show_full_period": True,
    "show_tooltip": True,
    "zoom_sync": True,
    "zoom_sync_group": "advanced-history-panel",
    "tooltip_sync": True,
    "tooltip_sync_group": "advanced-history-panel",
    "entities": DEFAULT_ENTITY_OPTIONS,
}

DEFAULT_MORE_INFO_CARD_OPTIONS = {
    "auto_scale_points": True,
    "card_background_color": "transparent",
    "card_border": False,
    "card_padding": 0,
    "card_shadow": False,
    "date_picker_default_mode": "day",
    "height": 240,
    "hours_to_show": 24,
    "show_legend": False,
    "show_now_line": False,
    "show_tooltip": True,
    "x_grid_style": "solid",
    "y_grid_style": "solid",
    "entities": DEFAULT_MORE_INFO_ENTITY_OPTIONS,
}

DEFAULT_OPTIONS = {
    CONF_TITLE: "Advanced History",
    CONF_SIDEBAR_ICON: "mdi:chart-timeline-variant-shimmer",
    CONF_MAX_ENTITIES: 30,
    CONF_DEFAULT_HOURS: 24,
    CONF_GRAPH_HEIGHT: 300,
    CONF_INCLUDE_HIDDEN: False,
    CONF_REDIRECT_SHOW_MORE: False,
    CONF_CARD_MODULE_URL: "",
    CONF_CARD_OPTIONS: DEFAULT_CARD_OPTIONS,
    CONF_ENTITY_OPTIONS: {},
    CONF_COMPARE: "follow_energy",
    CONF_REQUIRE_ADMIN: False,
}

DEFAULT_MORE_INFO_OPTIONS = {
    CONF_REPLACE_MORE_INFO_HISTORY: True,
    CONF_MORE_INFO_SHOW_DATE_PICKER: False,
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


def options_with_defaults(options: Mapping[str, Any]) -> dict[str, Any]:
    """Apply visible config-flow defaults without replacing explicit values."""
    merged = {**deepcopy(DEFAULT_OPTIONS), **dict(options)}
    if CONF_CARD_OPTIONS in options:
        configured_card = options[CONF_CARD_OPTIONS]
        card_options = (
            deepcopy(configured_card) if isinstance(configured_card, dict) else {}
        )
    else:
        # Recommended values are offered for a new/legacy entry only. Once the
        # field has been saved, its YAML is authoritative so removing a key
        # genuinely hands that option back to the graph card's own default.
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
        merged[CONF_MORE_INFO_CARD_OPTIONS] = (
            deepcopy(configured) if isinstance(configured, dict) else {}
        )
    else:
        merged[CONF_MORE_INFO_CARD_OPTIONS] = deepcopy(DEFAULT_MORE_INFO_CARD_OPTIONS)
    # This has a dedicated config-flow toggle and must not appear twice.
    merged[CONF_MORE_INFO_CARD_OPTIONS].pop("show_date_picker", None)
    return merged
