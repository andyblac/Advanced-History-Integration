"""Advanced History custom integration."""

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import ENTRY_TYPE_PANEL, config_entry_type
from .panel import (
    async_register_frontend,
    async_register_panel,
    async_unregister_frontend,
    async_unregister_panel,
)
from .websocket import async_register_websocket_commands


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
