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
    CONF_REDIRECT_SHOW_MORE,
    CONF_REPLACE_MORE_INFO_HISTORY,
    DOMAIN,
    ENTRY_TYPE_MORE_INFO,
    config_entry_type,
    more_info_options_with_defaults,
)

_WEBSOCKET_REGISTERED = f"{DOMAIN}_websocket_registered"
_BOOKMARK_STORE_DATA = f"{DOMAIN}_bookmark_store"
_MORE_INFO_ENTITY_STORE_DATA = f"{DOMAIN}_more_info_entity_store"
_MORE_INFO_PREFERENCE_STORE_DATA = f"{DOMAIN}_more_info_preference_store"
_STORAGE_KEY = f"{DOMAIN}.bookmarks"
_MORE_INFO_ENTITY_STORAGE_KEY = f"{DOMAIN}.more_info_entities"
_MORE_INFO_PREFERENCE_STORAGE_KEY = f"{DOMAIN}.more_info_preferences"
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

    async def async_save_user_bookmarks(
        self, user_id: str, bookmarks: list[dict[str, Any]]
    ) -> bool:
        """Save a user's bookmarks without overwriting administrator visibility."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            existing = data["users"].get(user_id, [])
            existing_visibility = {
                item.get("id"): bool(item.get("visible_everyone"))
                for item in existing
                if isinstance(item, dict) and isinstance(item.get("id"), str)
            }
            normalized = deepcopy(bookmarks)
            for bookmark in normalized:
                bookmark.pop("_owner_user_id", None)
                bookmark.pop("_owner_name", None)
                bookmark["visible_everyone"] = existing_visibility.get(
                    bookmark.get("id"), False
                )
            if (
                len(json.dumps(normalized, separators=(",", ":")).encode())
                > _MAX_BOOKMARK_BYTES
            ):
                return False
            data["users"][user_id] = normalized
            await self._store.async_save(data)
            return True

    async def async_catalog(self) -> dict[str, list[dict[str, Any]]]:
        """Return a copy of every user library for access filtering."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            return {
                user_id: deepcopy(bookmarks)
                for user_id, bookmarks in data["users"].items()
                if isinstance(user_id, str) and isinstance(bookmarks, list)
            }

    async def async_set_visible_everyone(
        self, user_id: str, bookmark_id: str, visible: bool
    ) -> bool:
        """Set the public visibility flag on one bookmark."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            bookmarks = data["users"].get(user_id)
            if not isinstance(bookmarks, list):
                return False
            bookmark = next(
                (
                    item
                    for item in bookmarks
                    if isinstance(item, dict) and item.get("id") == bookmark_id
                ),
                None,
            )
            if bookmark is None:
                return False
            bookmark["visible_everyone"] = visible
            await self._store.async_save(data)
            return True


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


class MoreInfoPreferenceStore:
    """Persist per-user More Info picker preferences."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the preference store."""
        self._store = Store[dict[str, Any]](
            hass, _STORAGE_VERSION, _MORE_INFO_PREFERENCE_STORAGE_KEY
        )
        self._data: dict[str, Any] | None = None
        self._lock = asyncio.Lock()

    async def _async_ensure_loaded(self) -> dict[str, Any]:
        """Load and normalize stored preferences once."""
        if self._data is None:
            loaded = await self._store.async_load()
            self._data = loaded if isinstance(loaded, dict) else {}
            if not isinstance(self._data.get("users"), dict):
                self._data["users"] = {}
            # Shared defaults now live in the More-Info config entry so the
            # integration options flow always reflects the active default.
            self._data.pop("default_picker_mode", None)
        return self._data

    async def async_get(self, user_id: str) -> str | None:
        """Return a user's picker preference."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            user_mode = data["users"].get(user_id)
            if user_mode in {"date", "interval"}:
                return user_mode
            return None

    async def async_set(self, user_id: str, mode: str) -> None:
        """Set one user's picker preference."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            data["users"][user_id] = mode
            await self._store.async_save(data)

    async def async_clear_all(self) -> None:
        """Clear user overrides after an administrator changes the default."""
        async with self._lock:
            data = await self._async_ensure_loaded()
            data["users"] = {}
            await self._store.async_save(data)


def _more_info_preference_store(hass: HomeAssistant) -> MoreInfoPreferenceStore:
    """Return the More Info picker preference store."""
    if _MORE_INFO_PREFERENCE_STORE_DATA not in hass.data:
        hass.data[_MORE_INFO_PREFERENCE_STORE_DATA] = MoreInfoPreferenceStore(hass)
    return hass.data[_MORE_INFO_PREFERENCE_STORE_DATA]


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/bookmarks/get",
        vol.Optional("user_id"): str,
    }
)
@websocket_api.async_response
async def websocket_get_bookmarks(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the user's bookmarks and the libraries they may view."""
    current_user_id = connection.user.id
    requested_user_id = msg.get("user_id", current_user_id)
    catalog = await _bookmark_store(hass).async_catalog()
    own_library = catalog.get(requested_user_id, [])
    if requested_user_id != current_user_id:
        if not connection.user.is_admin:
            connection.send_error(msg["id"], "unauthorized", "Admin access required")
            return
        bookmarks = own_library
    else:
        bookmarks = own_library

    users = await hass.auth.async_get_users()
    user_names = {user.id: user.name or user.id for user in users}
    shared_bookmarks: list[dict[str, Any]] = []
    for owner_id, owner_bookmarks in catalog.items():
        for bookmark in owner_bookmarks:
            if not bookmark.get("visible_everyone"):
                continue
            shared = deepcopy(bookmark)
            shared["_owner_user_id"] = owner_id
            shared["_owner_name"] = user_names.get(owner_id, owner_id)
            shared_bookmarks.append(shared)
    shared_bookmarks.sort(key=lambda item: item.get("saved_at", ""), reverse=True)

    admin_users = []
    if connection.user.is_admin:
        for user in users:
            bookmark_count = len(catalog.get(user.id, []))
            if user.id == current_user_id or bookmark_count:
                admin_users.append(
                    {
                        "id": user.id,
                        "name": user.name or user.id,
                        "bookmark_count": bookmark_count,
                    }
                )

    connection.send_result(
        msg["id"],
        {
            "initialized": requested_user_id in catalog,
            "bookmarks": bookmarks,
            "selected_user_id": requested_user_id,
            "shared_bookmarks": shared_bookmarks,
            "users": admin_users,
        },
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
    if not await _bookmark_store(hass).async_save_user_bookmarks(
        connection.user.id, msg["bookmarks"]
    ):
        connection.send_error(
            msg["id"], "too_large", "Bookmark library exceeds the storage limit"
        )
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/bookmarks/set_visible_everyone",
        vol.Required("user_id"): str,
        vol.Required("bookmark_id"): str,
        vol.Required("visible"): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_set_bookmark_visible_everyone(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Allow an administrator to publish or unpublish any bookmark."""
    if not await _bookmark_store(hass).async_set_visible_everyone(
        msg["user_id"], msg["bookmark_id"], msg["visible"]
    ):
        connection.send_error(msg["id"], "not_found", "Bookmark is not accessible")
        return
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
    entity_id = msg.get("entity_id")
    entity_config = (
        await _more_info_entity_store(hass).async_get(entity_id)
        if entity_id
        else None
    )
    picker_mode = await _more_info_preference_store(hass).async_get(
        connection.user.id
    )
    connection.send_result(
        msg["id"],
        {
            "enabled": bool(options[CONF_REPLACE_MORE_INFO_HISTORY]),
            "card_module_url": options[CONF_CARD_MODULE_URL],
            "card_options": card_options,
            "entity_config": entity_config,
            "picker_mode": picker_mode,
            "redirect_show_more": bool(options[CONF_REDIRECT_SHOW_MORE]),
            "can_edit_entity_config": bool(connection.user.is_admin),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/more_info/picker_mode/set",
        vol.Required("mode"): vol.In(["date", "interval"]),
    }
)
@websocket_api.async_response
async def websocket_set_more_info_picker_mode(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Update the configured admin default or one user's preference."""
    mode = msg["mode"]
    preference_store = _more_info_preference_store(hass)
    if connection.user.is_admin:
        entry = next(
            (
                candidate
                for candidate in hass.config_entries.async_entries(DOMAIN)
                if config_entry_type(candidate) == ENTRY_TYPE_MORE_INFO
            ),
            None,
        )
        if entry is None:
            connection.send_error(
                msg["id"], "not_found", "More-Info service is not configured"
            )
            return

        options = deepcopy(dict(entry.options))
        configured_card_options = options.get(CONF_MORE_INFO_CARD_OPTIONS)
        card_options = (
            deepcopy(configured_card_options)
            if isinstance(configured_card_options, dict)
            else deepcopy(
                more_info_options_with_defaults({})[CONF_MORE_INFO_CARD_OPTIONS]
            )
        )
        card_options["show_date_picker"] = mode == "date"
        card_options["show_interval_picker"] = mode == "interval"
        options[CONF_MORE_INFO_SHOW_DATE_PICKER] = mode == "date"
        options[CONF_MORE_INFO_CARD_OPTIONS] = card_options
        hass.config_entries.async_update_entry(entry, options=options)
        await preference_store.async_clear_all()
    else:
        await preference_store.async_set(connection.user.id, mode)
    connection.send_result(msg["id"])


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
    websocket_api.async_register_command(
        hass, websocket_set_bookmark_visible_everyone
    )
    websocket_api.async_register_command(hass, websocket_get_more_info_config)
    websocket_api.async_register_command(hass, websocket_set_more_info_picker_mode)
    websocket_api.async_register_command(hass, websocket_set_more_info_entity_config)
    hass.data[_WEBSOCKET_REGISTERED] = True
