"""Advanced History custom integration."""

from copy import deepcopy

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    CONF_MORE_INFO_CARD_OPTIONS,
    DEFAULT_MORE_INFO_CARD_OPTIONS,
    ENTRY_TYPE_MORE_INFO,
    ENTRY_TYPE_PANEL,
    config_entry_type,
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
    if entry.version > 4:
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

    hass.config_entries.async_update_entry(entry, options=options, version=4)
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
