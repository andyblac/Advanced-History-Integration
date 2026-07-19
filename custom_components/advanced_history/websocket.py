"""WebSocket commands for user-scoped Advanced History bookmarks."""

from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.websocket_api import ActiveConnection
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

_WEBSOCKET_REGISTERED = f"{DOMAIN}_websocket_registered"
_BOOKMARK_STORE_DATA = f"{DOMAIN}_bookmark_store"
_STORAGE_KEY = f"{DOMAIN}.bookmarks"
_STORAGE_VERSION = 1
_MAX_BOOKMARKS = 100
_MAX_BOOKMARK_BYTES = 2_000_000


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


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register integration WebSocket commands once per Home Assistant process."""
    if hass.data.get(_WEBSOCKET_REGISTERED):
        return

    websocket_api.async_register_command(hass, websocket_get_bookmarks)
    websocket_api.async_register_command(hass, websocket_save_bookmarks)
    hass.data[_WEBSOCKET_REGISTERED] = True
