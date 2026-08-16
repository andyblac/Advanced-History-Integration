"""Advanced History custom integration."""

from copy import deepcopy

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    CARD_OPTIONS_NUMERIC_ENTITIES,
    CARD_OPTIONS_STATE_ENTITIES,
    CONF_CARD_OPTIONS,
    CONF_COMPARE,
    CONF_DEFAULT_HOURS,
    CONF_MORE_INFO_CARD_OPTIONS,
    CONF_NUMERIC_CARD_OPTIONS,
    CONF_REDIRECT_SHOW_MORE,
    CONF_TITLE,
    CONF_STATE_CARD_OPTIONS,
    DEFAULT_CARD_OPTIONS,
    DEFAULT_MORE_INFO_CARD_OPTIONS,
    DEFAULT_MORE_INFO_NUMERIC_CARD_OPTIONS,
    DEFAULT_MORE_INFO_STATE_CARD_OPTIONS,
    DEFAULT_NUMERIC_CARD_OPTIONS,
    DEFAULT_STATE_CARD_OPTIONS,
    DOMAIN,
    ENTRY_TYPE_MORE_INFO,
    ENTRY_TYPE_PANEL,
    config_entry_type,
    split_legacy_card_options,
)
from .panel import (
    async_register_frontend,
    async_register_panel,
    async_unregister_frontend,
    async_unregister_panel,
)
from .websocket import async_register_websocket_commands


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Migrate Advanced History config entries."""
    if entry.version > 14:
        return False

    options = deepcopy(dict(entry.options))
    if entry.version < 2 and config_entry_type(entry) == ENTRY_TYPE_MORE_INFO:
        configured = options.get(CONF_MORE_INFO_CARD_OPTIONS)
        card_options = (
            deepcopy(configured)
            if isinstance(configured, dict)
            else deepcopy(DEFAULT_MORE_INFO_CARD_OPTIONS)
        )
        card_options.setdefault("state_timeline_corner_radius", 0)
        card_options.setdefault("x_axis_font_size", 12)
        options[CONF_MORE_INFO_CARD_OPTIONS] = card_options

    if entry.version < 3 and config_entry_type(entry) == ENTRY_TYPE_MORE_INFO:
        configured = options.get(CONF_MORE_INFO_CARD_OPTIONS)
        card_options = (
            deepcopy(configured)
            if isinstance(configured, dict)
            else deepcopy(DEFAULT_MORE_INFO_CARD_OPTIONS)
        )
        card_options.setdefault("y_axis_font_size", 12)
        options[CONF_MORE_INFO_CARD_OPTIONS] = card_options

    if entry.version < 4 and config_entry_type(entry) == ENTRY_TYPE_MORE_INFO:
        configured = options.get(CONF_MORE_INFO_CARD_OPTIONS)
        card_options = (
            deepcopy(configured)
            if isinstance(configured, dict)
            else deepcopy(DEFAULT_MORE_INFO_CARD_OPTIONS)
        )
        for key in (
            "x_axis_color",
            "x_axis_date_color",
            "x_grid_color",
            "x_grid_opacity",
            "y_axis_color",
            "y_grid_color",
            "y_grid_opacity",
        ):
            card_options.setdefault(key, DEFAULT_MORE_INFO_CARD_OPTIONS[key])
        options[CONF_MORE_INFO_CARD_OPTIONS] = card_options

    if entry.version < 5 and config_entry_type(entry) == ENTRY_TYPE_MORE_INFO:
        configured = options.get(CONF_MORE_INFO_CARD_OPTIONS)
        card_options = (
            deepcopy(configured)
            if isinstance(configured, dict)
            else deepcopy(DEFAULT_MORE_INFO_CARD_OPTIONS)
        )
        if card_options.get("date_picker_default_mode") == "day":
            card_options["date_picker_default_mode"] = "last_24h"
        if card_options.get("hours_to_show") == 24:
            card_options.pop("hours_to_show")
        options[CONF_MORE_INFO_CARD_OPTIONS] = card_options

    if entry.version < 7 and config_entry_type(entry) == ENTRY_TYPE_PANEL:
        configured = options.get(CONF_CARD_OPTIONS)
        card_options = (
            deepcopy(configured)
            if isinstance(configured, dict)
            else deepcopy(DEFAULT_CARD_OPTIONS)
        )
        legacy_entities = card_options.pop("entities", None)
        if isinstance(legacy_entities, (dict, list)):
            card_options.setdefault(
                CARD_OPTIONS_NUMERIC_ENTITIES, deepcopy(legacy_entities)
            )
            card_options.setdefault(
                CARD_OPTIONS_STATE_ENTITIES, deepcopy(legacy_entities)
            )
        options[CONF_CARD_OPTIONS] = card_options

    if entry.version < 8 and config_entry_type(entry) == ENTRY_TYPE_PANEL:
        options.pop(CONF_DEFAULT_HOURS, None)

    if entry.version < 9 and config_entry_type(entry) == ENTRY_TYPE_PANEL:
        options.pop(CONF_COMPARE, None)

    is_panel = config_entry_type(entry) == ENTRY_TYPE_PANEL
    if entry.version < 10 and is_panel:
        options.pop(CONF_TITLE, None)

    if entry.version < 11 and is_panel:
        redirect_show_more = options.pop(CONF_REDIRECT_SHOW_MORE, None)
        if redirect_show_more is not None:
            more_info_entry = next(
                (
                    candidate
                    for candidate in hass.config_entries.async_entries(DOMAIN)
                    if config_entry_type(candidate) == ENTRY_TYPE_MORE_INFO
                ),
                None,
            )
            if more_info_entry is not None:
                more_info_options = deepcopy(dict(more_info_entry.options))
                more_info_options.setdefault(
                    CONF_REDIRECT_SHOW_MORE, bool(redirect_show_more)
                )
                hass.config_entries.async_update_entry(
                    more_info_entry, options=more_info_options
                )

    if entry.version < 12 and not is_panel:
        configured = options.get(CONF_MORE_INFO_CARD_OPTIONS)
        card_options = (
            deepcopy(configured)
            if isinstance(configured, dict)
            else deepcopy(DEFAULT_MORE_INFO_CARD_OPTIONS)
        )
        legacy_entities = card_options.pop("entities", None)
        card_options.pop("energy_date_sync", None)
        card_options.pop("energy_collection_key", None)
        if isinstance(legacy_entities, (dict, list)):
            card_options.setdefault(
                CARD_OPTIONS_NUMERIC_ENTITIES, deepcopy(legacy_entities)
            )
            card_options.setdefault(
                CARD_OPTIONS_STATE_ENTITIES, deepcopy(legacy_entities)
            )
        options[CONF_MORE_INFO_CARD_OPTIONS] = card_options

    if entry.version < 13:
        legacy_key = CONF_CARD_OPTIONS if is_panel else CONF_MORE_INFO_CARD_OPTIONS
        legacy = options.pop(legacy_key, {})
        legacy = deepcopy(legacy) if isinstance(legacy, dict) else {}
        numeric_defaults = (
            DEFAULT_NUMERIC_CARD_OPTIONS
            if is_panel
            else DEFAULT_MORE_INFO_NUMERIC_CARD_OPTIONS
        )
        state_defaults = (
            DEFAULT_STATE_CARD_OPTIONS
            if is_panel
            else DEFAULT_MORE_INFO_STATE_CARD_OPTIONS
        )
        numeric, state = split_legacy_card_options(
            legacy, numeric_defaults, state_defaults
        )
        options.setdefault(CONF_NUMERIC_CARD_OPTIONS, numeric)
        options.setdefault(CONF_STATE_CARD_OPTIONS, state)

    if entry.version < 14 and is_panel:
        configured_numeric = options.get(CONF_NUMERIC_CARD_OPTIONS)
        if isinstance(configured_numeric, dict):
            numeric = deepcopy(configured_numeric)
            # Until v14, true was written into every panel's numeric defaults.
            # Remove that inherited value so Automatic detail can supply the
            # new default. Explicit false values remain untouched.
            if numeric.get("auto_scale_points") is True:
                numeric.pop("auto_scale_points")
            options[CONF_NUMERIC_CARD_OPTIONS] = numeric

    hass.config_entries.async_update_entry(
        entry,
        options=options,
        version=14,
        title="Advanced History" if is_panel else entry.title,
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Advanced History from a config entry."""
    async_register_websocket_commands(hass)
    await async_register_frontend(hass, entry.entry_id)
    if config_entry_type(entry) == ENTRY_TYPE_PANEL:
        await async_register_panel(hass, entry)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Advanced History."""
    if config_entry_type(entry) == ENTRY_TYPE_PANEL:
        async_unregister_panel(hass)
    async_unregister_frontend(hass, entry.entry_id)
    return True
