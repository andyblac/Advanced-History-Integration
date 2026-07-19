"""Advanced History custom integration."""

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .panel import async_register_panel, async_unregister_panel
from .websocket import async_register_websocket_commands


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Advanced History from a config entry."""
    async_register_websocket_commands(hass)
    await async_register_panel(hass, entry)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Advanced History."""
    async_unregister_panel(hass)
    return True
