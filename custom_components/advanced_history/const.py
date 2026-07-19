"""Constants for Advanced History."""

from copy import deepcopy
from typing import Any, Mapping

DOMAIN = "advanced_history"
VERSION = "0.5.4"

PANEL_URL_PATH = "advanced-history"
PANEL_ELEMENT = "advanced-history-panel"
PANEL_MODULE_URL = f"/advanced_history/advanced-history-panel.js?v={VERSION}"
REDIRECT_MODULE_URL = f"/advanced_history/advanced-history-redirect.js?v={VERSION}"

CONF_TITLE = "title"
CONF_SIDEBAR_ICON = "sidebar_icon"
CONF_MAX_ENTITIES = "max_entities"
CONF_DEFAULT_HOURS = "default_hours"
CONF_GRAPH_HEIGHT = "graph_height"
CONF_INCLUDE_HIDDEN = "include_hidden"
CONF_REDIRECT_SHOW_MORE = "redirect_show_more"
CONF_CARD_MODULE_URL = "card_module_url"
CONF_CARD_OPTIONS = "card_options"
CONF_ENTITY_OPTIONS = "entity_options"
CONF_COMPARE = "compare"
CONF_REQUIRE_ADMIN = "require_admin"

DEFAULT_ENTITY_OPTIONS = {
    "show_in_legend": True,
}

DEFAULT_CARD_OPTIONS = {
    "auto_scale_points": True,
    "show_tooltip": True,
    "show_export": True,
    "zoom_sync": True,
    "zoom_sync_group": "advanced-history-panel",
    "tooltip_sync": True,
    "tooltip_sync_group": "advanced-history-panel",
    "entities": DEFAULT_ENTITY_OPTIONS,
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
