"""WebSocket commands for Advanced History frontend storage and settings."""

from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.websocket_api import ActiveConnection
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store

from .const import (
    CONF_CARD_MODULE_URL,
    CONF_MORE_INFO_CARD_OPTIONS,
    CONF_MORE_INFO_SHOW_DATE_PICKER,
    CONF_REPLACE_MORE_INFO_HISTORY,
    DOMAIN,
    ENTRY_TYPE_MORE_INFO,
    config_entry_type,
    more_info_options_with_defaults,
)

_WEBSOCKET_REGISTERED = f"{DOMAIN}_websocket_registered"
_BOOKMARK_STORE_DATA = f"{DOMAIN}_bookmark_store"
_MORE_INFO_ENTITY_STORE_DATA = f"{DOMAIN}_more_info_entity_store"
_STORAGE_KEY = f"{DOMAIN}.bookmarks"
_MORE_INFO_ENTITY_STORAGE_KEY = f"{DOMAIN}.more_info_entities"
_STORAGE_VERSION = 1
_MAX_BOOKMARKS = 100
_MAX_BOOKMARK_BYTES = 2_000_000
_MAX_MORE_INFO_ENTITY_CONFIG_BYTES = 100_000
_MAX_MORE_INFO_ENTITY_STORE_BYTES = 2_000_000


class BookmarkStore:
    """Persist bookmark libraries by Home Assistant user."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the bookmark store."""
        self._store = Store[dict[str, Any]](hass, _STORAGE_VERSION, _STORAGE_KEY)
        self._data: dict[str, Any] | None = None
        self._lock = asyncio.Lock()

    async def _async_ensure_loaded(self) -> dict[str, Any]:
        """Load and normalize stored bookmark data once."""
        if self._data is None:
            loaded = await self._store.async_load()
            self._data = loaded if isinstance(loaded, dict) else {}
            if not isinstance(self._data.get("users"), dict):
                self._data["users"] = {}
        return self._data

    async def async_get(self, user_id: str) -> tuple[bool, list[dict[str, Any]]]:
        """Return whether a library exists and its bookmarks."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            users = data["users"]
            initialized = user_id in users
            bookmarks = users.get(user_id, [])
            normalized = bookmarks if isinstance(bookmarks, list) else []
            return initialized, deepcopy(normalized)

    async def async_save(self, user_id: str, bookmarks: list[dict[str, Any]]) -> None:
        """Replace one user's bookmark library."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            data["users"][user_id] = deepcopy(bookmarks)
            await self._store.async_save(data)


def _bookmark_store(hass: HomeAssistant) -> BookmarkStore:
    """Return the integration bookmark store."""
    if _BOOKMARK_STORE_DATA not in hass.data:
        hass.data[_BOOKMARK_STORE_DATA] = BookmarkStore(hass)
    return hass.data[_BOOKMARK_STORE_DATA]


class MoreInfoEntityStore:
    """Persist shared More Info graph overrides by entity ID."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the entity override store."""
        self._store = Store[dict[str, Any]](
            hass, _STORAGE_VERSION, _MORE_INFO_ENTITY_STORAGE_KEY
        )
        self._data: dict[str, Any] | None = None
        self._lock = asyncio.Lock()

    async def _async_ensure_loaded(self) -> dict[str, Any]:
        """Load and normalize stored entity overrides once."""
        if self._data is None:
            loaded = await self._store.async_load()
            self._data = loaded if isinstance(loaded, dict) else {}
            if not isinstance(self._data.get("entities"), dict):
                self._data["entities"] = {}
        return self._data

    async def async_get(self, entity_id: str) -> dict[str, Any] | None:
        """Return one entity's saved More Info override."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            configured = data["entities"].get(entity_id)
            return deepcopy(configured) if isinstance(configured, dict) else None

    async def async_set(
        self, entity_id: str, config: dict[str, Any] | None
    ) -> bool:
        """Save or remove one entity override, enforcing the store limit."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            entities = data["entities"]
            previous = entities.get(entity_id)
            if config:
                entities[entity_id] = deepcopy(config)
            else:
                entities.pop(entity_id, None)
            if (
                len(json.dumps(data, separators=(",", ":")).encode())
                > _MAX_MORE_INFO_ENTITY_STORE_BYTES
            ):
                if previous is None:
                    entities.pop(entity_id, None)
                else:
                    entities[entity_id] = previous
                return False
            await self._store.async_save(data)
            return True


def _more_info_entity_store(hass: HomeAssistant) -> MoreInfoEntityStore:
    """Return the shared More Info entity override store."""
    if _MORE_INFO_ENTITY_STORE_DATA not in hass.data:
        hass.data[_MORE_INFO_ENTITY_STORE_DATA] = MoreInfoEntityStore(hass)
    return hass.data[_MORE_INFO_ENTITY_STORE_DATA]


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/bookmarks/get"}
)
@websocket_api.async_response
async def websocket_get_bookmarks(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return bookmarks belonging to the connected Home Assistant user."""
    initialized, bookmarks = await _bookmark_store(hass).async_get(connection.user.id)
    connection.send_result(
        msg["id"], {"initialized": initialized, "bookmarks": bookmarks}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/bookmarks/save",
        vol.Required("bookmarks"): vol.All(
            [dict], vol.Length(max=_MAX_BOOKMARKS)
        ),
    }
)
@websocket_api.async_response
async def websocket_save_bookmarks(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Save bookmarks belonging to the connected Home Assistant user."""
    bookmarks = msg["bookmarks"]
    if len(json.dumps(bookmarks, separators=(",", ":")).encode()) > _MAX_BOOKMARK_BYTES:
        connection.send_error(
            msg["id"], "too_large", "Bookmark library exceeds the storage limit"
        )
        return

    await _bookmark_store(hass).async_save(connection.user.id, bookmarks)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/more_info/config",
        vol.Optional("entity_id"): cv.entity_id,
    }
)
@websocket_api.async_response
async def websocket_get_more_info_config(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the independently configured More-Info graph settings."""
    entry = next(
        (
            candidate
            for candidate in hass.config_entries.async_entries(DOMAIN)
            if config_entry_type(candidate) == ENTRY_TYPE_MORE_INFO
            and candidate.state is ConfigEntryState.LOADED
        ),
        None,
    )
    if entry is None:
        connection.send_result(msg["id"], {"enabled": False})
        return

    options = more_info_options_with_defaults(entry.options)
    card_options = deepcopy(options[CONF_MORE_INFO_CARD_OPTIONS])
    card_options["show_date_picker"] = bool(
        options[CONF_MORE_INFO_SHOW_DATE_PICKER]
    )
    entity_id = msg.get("entity_id")
    entity_config = (
        await _more_info_entity_store(hass).async_get(entity_id)
        if entity_id
        else None
    )
    connection.send_result(
        msg["id"],
        {
            "enabled": bool(options[CONF_REPLACE_MORE_INFO_HISTORY]),
            "card_module_url": options[CONF_CARD_MODULE_URL],
            "card_options": card_options,
            "entity_config": entity_config,
            "can_edit_entity_config": bool(connection.user.is_admin),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/more_info/entity_config/set",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("config"): vol.Any(dict, None),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_set_more_info_entity_config(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Save or reset the More Info graph override for one entity."""
    config = msg["config"]
    if config is not None and (
        len(json.dumps(config, separators=(",", ":")).encode())
        > _MAX_MORE_INFO_ENTITY_CONFIG_BYTES
    ):
        connection.send_error(
            msg["id"], "too_large", "Entity graph configuration is too large"
        )
        return
    if not await _more_info_entity_store(hass).async_set(msg["entity_id"], config):
        connection.send_error(
            msg["id"], "too_large", "More Info entity settings exceed the storage limit"
        )
        return
    connection.send_result(msg["id"])


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register integration WebSocket commands once per Home Assistant process."""
    if hass.data.get(_WEBSOCKET_REGISTERED):
        return

    websocket_api.async_register_command(hass, websocket_get_bookmarks)
    websocket_api.async_register_command(hass, websocket_save_bookmarks)
    websocket_api.async_register_command(hass, websocket_get_more_info_config)
    websocket_api.async_register_command(hass, websocket_set_more_info_entity_config)
    hass.data[_WEBSOCKET_REGISTERED] = True
