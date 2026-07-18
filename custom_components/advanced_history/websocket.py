"""WebSocket commands for the Advanced History graph editor."""

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.websocket_api import ActiveConnection
from homeassistant.core import HomeAssistant

from .const import (
    CONF_CARD_OPTIONS,
    CONF_DEFAULT_HOURS,
    CONF_ENTITY_OPTIONS,
    CONF_GRAPH_HEIGHT,
    DOMAIN,
)

_WEBSOCKET_REGISTERED = f"{DOMAIN}_websocket_registered"


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/update_graph_options",
        vol.Required("entry_id"): str,
        vol.Required("card_options"): dict,
        vol.Required("entity_options"): dict,
        vol.Required("default_hours"): vol.All(vol.Coerce(int), vol.Range(min=1)),
        vol.Required("graph_height"): vol.All(vol.Coerce(int), vol.Range(min=1)),
    }
)
@websocket_api.require_admin
def websocket_update_graph_options(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict
) -> None:
    """Save graph editor options and reload the panel."""
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if entry is None or entry.domain != DOMAIN:
        connection.send_error(msg["id"], "not_found", "Config entry not found")
        return

    options = {
        **entry.options,
        CONF_CARD_OPTIONS: msg["card_options"],
        CONF_ENTITY_OPTIONS: msg["entity_options"],
        CONF_DEFAULT_HOURS: msg["default_hours"],
        CONF_GRAPH_HEIGHT: msg["graph_height"],
    }
    hass.config_entries.async_update_entry(entry, options=options)
    connection.send_result(msg["id"])
    hass.config_entries.async_schedule_reload(entry.entry_id)


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register integration WebSocket commands once per HA process."""
    if hass.data.get(_WEBSOCKET_REGISTERED):
        return

    websocket_api.async_register_command(hass, websocket_update_graph_options)
    hass.data[_WEBSOCKET_REGISTERED] = True
