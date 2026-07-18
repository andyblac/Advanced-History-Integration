"""Config flow for Advanced History."""

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.helpers import selector

from .const import (
    CONF_CARD_MODULE_URL,
    CONF_CARD_OPTIONS,
    CONF_COMPARE,
    CONF_DEFAULT_HOURS,
    CONF_ENTITY_OPTIONS,
    CONF_GRAPH_HEIGHT,
    CONF_INCLUDE_HIDDEN,
    CONF_MAX_ENTITIES,
    CONF_REDIRECT_SHOW_MORE,
    CONF_REQUIRE_ADMIN,
    CONF_SIDEBAR_ICON,
    CONF_TITLE,
    DEFAULT_OPTIONS,
    DOMAIN,
    options_with_defaults,
)


def _settings_schema(values: dict[str, Any]) -> vol.Schema:
    """Return the settings form schema."""
    return vol.Schema(
        {
            vol.Optional(CONF_TITLE, default=values[CONF_TITLE]): selector.TextSelector(),
            vol.Optional(
                CONF_SIDEBAR_ICON, default=values[CONF_SIDEBAR_ICON]
            ): selector.IconSelector(),
            vol.Optional(
                CONF_MAX_ENTITIES, default=values[CONF_MAX_ENTITIES]
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1, max=200, step=1, mode=selector.NumberSelectorMode.BOX
                )
            ),
            vol.Optional(
                CONF_DEFAULT_HOURS, default=values[CONF_DEFAULT_HOURS]
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1, max=8760, step=1, mode=selector.NumberSelectorMode.BOX
                )
            ),
            vol.Optional(
                CONF_GRAPH_HEIGHT, default=values[CONF_GRAPH_HEIGHT]
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=150, max=1200, step=10, mode=selector.NumberSelectorMode.BOX
                )
            ),
            vol.Optional(
                CONF_INCLUDE_HIDDEN, default=values[CONF_INCLUDE_HIDDEN]
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_REDIRECT_SHOW_MORE, default=values[CONF_REDIRECT_SHOW_MORE]
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_CARD_MODULE_URL, default=values[CONF_CARD_MODULE_URL]
            ): selector.TextSelector(),
            vol.Optional(
                CONF_CARD_OPTIONS, default=values[CONF_CARD_OPTIONS]
            ): selector.ObjectSelector(),
            vol.Optional(CONF_COMPARE, default=values[CONF_COMPARE]): (
                selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            "follow_energy",
                            "previous_period",
                            "last_year",
                            "disabled",
                        ],
                        mode=selector.SelectSelectorMode.DROPDOWN,
                        translation_key="compare_mode",
                    )
                )
            ),
            vol.Optional(
                CONF_REQUIRE_ADMIN, default=values[CONF_REQUIRE_ADMIN]
            ): selector.BooleanSelector(),
        }
    )


class AdvancedHistoryConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle an Advanced History config flow."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Create the single Advanced History entry."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(
                title=user_input[CONF_TITLE], data={}, options=user_input
            )
        return self.async_show_form(
            step_id="user", data_schema=_settings_schema(DEFAULT_OPTIONS)
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Reconfigure Advanced History from the integration entry cog."""
        entry = self._get_reconfigure_entry()
        if user_input is not None:
            user_input[CONF_ENTITY_OPTIONS] = entry.options.get(
                CONF_ENTITY_OPTIONS, {}
            )
            return self.async_update_reload_and_abort(
                entry,
                title=user_input[CONF_TITLE],
                options=user_input,
            )

        values = options_with_defaults(entry.options)
        return self.async_show_form(
            step_id="reconfigure", data_schema=_settings_schema(values)
        )

    @staticmethod
    def async_get_options_flow(config_entry: ConfigEntry):
        """Return the options flow."""
        return AdvancedHistoryOptionsFlow()


class AdvancedHistoryOptionsFlow(OptionsFlowWithReload):
    """Handle Advanced History options."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Edit Advanced History options."""
        if user_input is not None:
            user_input[CONF_ENTITY_OPTIONS] = self.config_entry.options.get(
                CONF_ENTITY_OPTIONS, {}
            )
            return self.async_create_entry(title="", data=user_input)
        values = options_with_defaults(self.config_entry.options)
        return self.async_show_form(
            step_id="init", data_schema=_settings_schema(values)
        )
