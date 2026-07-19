"""Frontend and sidebar panel registration for Advanced History."""

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    CONF_CARD_MODULE_URL,
    CONF_COMPARE,
    CONF_REQUIRE_ADMIN,
    CONF_SIDEBAR_ICON,
    CONF_TITLE,
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_MODULE_URL,
    PANEL_URL_PATH,
    REDIRECT_MODULE_URL,
    VERSION,
    options_with_defaults,
)

_STATIC_REGISTERED = f"{DOMAIN}_static_registered"


async def _async_register_static_files(hass: HomeAssistant) -> None:
    """Expose the integration frontend directory once per HA process."""
    if hass.data.get(_STATIC_REGISTERED):
        return

    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig("/advanced_history", str(frontend_dir), False)]
    )
    hass.data[_STATIC_REGISTERED] = True


def _panel_config(entry: ConfigEntry) -> tuple[dict, dict]:
    """Return normalized options and the configuration exposed to the panel."""
    options = options_with_defaults(entry.options)
    panel_config = {
        key: value
        for key, value in options.items()
        if key not in {CONF_SIDEBAR_ICON, CONF_REQUIRE_ADMIN, CONF_COMPARE}
    }
    panel_config["config_entry_id"] = entry.entry_id
    panel_config["settings_path"] = f"/config/integrations/integration/{DOMAIN}"
    panel_config["integration_version"] = VERSION

    compare = options[CONF_COMPARE]
    if compare == "disabled":
        panel_config[CONF_COMPARE] = False
    elif compare != "follow_energy":
        panel_config[CONF_COMPARE] = compare

    if not panel_config.get(CONF_CARD_MODULE_URL):
        panel_config.pop(CONF_CARD_MODULE_URL, None)

    return options, panel_config


async def async_register_panel(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Register frontend resources and the Advanced History sidebar panel."""
    await _async_register_static_files(hass)

    # This lightweight hook is inert unless redirect_show_more is enabled.
    frontend.add_extra_js_url(hass, REDIRECT_MODULE_URL)

    options, panel_config = _panel_config(entry)

    # Replace an older panel_custom YAML registration using the same route.
    if frontend.async_panel_exists(hass, PANEL_URL_PATH):
        frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title=options[CONF_TITLE],
        sidebar_icon=options[CONF_SIDEBAR_ICON],
        module_url=PANEL_MODULE_URL,
        config=panel_config,
        require_admin=options[CONF_REQUIRE_ADMIN],
    )


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the sidebar panel and global redirect hook."""
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    frontend.remove_extra_js_url(hass, REDIRECT_MODULE_URL)
