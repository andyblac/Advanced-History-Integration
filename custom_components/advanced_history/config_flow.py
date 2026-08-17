"""Config flow for Advanced History."""

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
    SOURCE_USER,
)
from homeassistant.helpers import selector

from .const import (
    CONF_CARD_MODULE_URL,
    CONF_ENTITY_OPTIONS,
    CONF_ENTRY_TYPE,
    CONF_INCLUDE_HIDDEN,
    CONF_LARGE_RANGE_AUTOMATIC_DETAIL,
    CONF_LARGE_RANGE_DETAIL_THRESHOLD_DAYS,
    CONF_MAX_ENTITIES,
    CONF_MAX_TABS,
    CONF_NUMERIC_CARD_OPTIONS,
    CONF_MORE_INFO_SHOW_DATE_PICKER,
    CONF_REDIRECT_SHOW_MORE,
    CONF_REPLACE_MORE_INFO_HISTORY,
    CONF_REQUIRE_ADMIN,
    CONF_SIDEBAR_ICON,
    CONF_STATE_CARD_OPTIONS,
    CONF_TITLE,
    DEFAULT_MORE_INFO_OPTIONS,
    DEFAULT_OPTIONS,
    DOMAIN,
    ENTRY_TYPE_MORE_INFO,
    ENTRY_TYPE_PANEL,
    config_entry_type,
    more_info_options_with_defaults,
    options_with_defaults,
)


def _panel_schema(values: dict[str, Any]) -> vol.Schema:
    """Return the Advanced History panel form schema."""
    numeric_card_options = dict(values[CONF_NUMERIC_CARD_OPTIONS])
    numeric_card_options.setdefault(
        "auto_scale_points",
        values[CONF_LARGE_RANGE_AUTOMATIC_DETAIL] is not False,
    )
    return vol.Schema(
        {
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
                CONF_MAX_TABS, default=values[CONF_MAX_TABS]
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1, max=50, step=1, mode=selector.NumberSelectorMode.BOX
                )
            ),
            vol.Optional(
                CONF_LARGE_RANGE_AUTOMATIC_DETAIL,
                default=values[CONF_LARGE_RANGE_AUTOMATIC_DETAIL],
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_LARGE_RANGE_DETAIL_THRESHOLD_DAYS,
                default=values[CONF_LARGE_RANGE_DETAIL_THRESHOLD_DAYS],
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=7, max=3650, step=1, mode=selector.NumberSelectorMode.BOX
                )
            ),
            vol.Optional(
                CONF_INCLUDE_HIDDEN, default=values[CONF_INCLUDE_HIDDEN]
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_NUMERIC_CARD_OPTIONS,
                default=numeric_card_options,
            ): selector.ObjectSelector(),
            vol.Optional(
                CONF_STATE_CARD_OPTIONS,
                default=values[CONF_STATE_CARD_OPTIONS],
            ): selector.ObjectSelector(),
            vol.Optional(
                CONF_REQUIRE_ADMIN, default=values[CONF_REQUIRE_ADMIN]
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_CARD_MODULE_URL, default=values[CONF_CARD_MODULE_URL]
            ): selector.TextSelector(),
        }
    )


def _automatic_detail_options_from_input(
    user_input: dict[str, Any], existing: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Keep the switch-derived point-scaling value as an inherited default."""
    result = dict(user_input)
    numeric = result.get(CONF_NUMERIC_CARD_OPTIONS)
    if not isinstance(numeric, dict):
        return result

    configured = (existing or {}).get(CONF_NUMERIC_CARD_OPTIONS)
    configured = configured if isinstance(configured, dict) else {}
    if "auto_scale_points" not in configured:
        previous_automatic_detail = (existing or {}).get(
            CONF_LARGE_RANGE_AUTOMATIC_DETAIL, True
        )
        if numeric.get("auto_scale_points") == (
            previous_automatic_detail is not False
        ):
            numeric = dict(numeric)
            numeric.pop("auto_scale_points", None)
            result[CONF_NUMERIC_CARD_OPTIONS] = numeric
    return result


def _more_info_schema(values: dict[str, Any]) -> vol.Schema:
    """Return the independent More-Info service form schema."""
    numeric_card_options = dict(values[CONF_NUMERIC_CARD_OPTIONS])
    numeric_card_options.setdefault(
        "auto_scale_points",
        values[CONF_LARGE_RANGE_AUTOMATIC_DETAIL] is not False,
    )
    return vol.Schema(
        {
            vol.Optional(
                CONF_REPLACE_MORE_INFO_HISTORY,
                default=values[CONF_REPLACE_MORE_INFO_HISTORY],
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_MORE_INFO_SHOW_DATE_PICKER,
                default=values[CONF_MORE_INFO_SHOW_DATE_PICKER],
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_REDIRECT_SHOW_MORE, default=values[CONF_REDIRECT_SHOW_MORE]
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_LARGE_RANGE_AUTOMATIC_DETAIL,
                default=values[CONF_LARGE_RANGE_AUTOMATIC_DETAIL],
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_NUMERIC_CARD_OPTIONS,
                default=numeric_card_options,
            ): selector.ObjectSelector(),
            vol.Optional(
                CONF_STATE_CARD_OPTIONS,
                default=values[CONF_STATE_CARD_OPTIONS],
            ): selector.ObjectSelector(),
            vol.Optional(
                CONF_CARD_MODULE_URL, default=values[CONF_CARD_MODULE_URL]
            ): selector.TextSelector(),
        }
    )


class AdvancedHistoryConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle Advanced History config entries."""

    VERSION = 15

    def _configured_types(self) -> set[str]:
        """Return the service roles which are already configured."""
        return {config_entry_type(entry) for entry in self._async_current_entries()}

    async def async_on_create_entry(
        self, result: ConfigFlowResult
    ) -> ConfigFlowResult:
        """Add the More-Info service with defaults after first-time setup."""
        entry = result.get("result")
        if (
            not isinstance(entry, ConfigEntry)
            or config_entry_type(entry) != ENTRY_TYPE_PANEL
            or ENTRY_TYPE_MORE_INFO in self._configured_types()
        ):
            return result

        more_info_flow = await self.hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": SOURCE_USER},
        )
        if more_info_flow.get("step_id") == "more_info":
            await self.hass.config_entries.flow.async_configure(
                more_info_flow["flow_id"],
                dict(DEFAULT_MORE_INFO_OPTIONS),
            )
        return result

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Create the missing service, starting with the main panel."""
        configured = self._configured_types()
        if ENTRY_TYPE_PANEL not in configured:
            return await self.async_step_panel(user_input)
        if ENTRY_TYPE_MORE_INFO not in configured:
            return await self.async_step_more_info(user_input)
        return self.async_abort(reason="already_configured")

    async def async_step_panel(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Create the Advanced History panel service entry."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(
                title=DEFAULT_OPTIONS[CONF_TITLE],
                data={CONF_ENTRY_TYPE: ENTRY_TYPE_PANEL},
                options=_automatic_detail_options_from_input(user_input),
            )
        return self.async_show_form(
            step_id="user", data_schema=_panel_schema(DEFAULT_OPTIONS)
        )

    async def async_step_more_info(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Create the More-Info graph replacement service entry."""
        await self.async_set_unique_id(f"{DOMAIN}_{ENTRY_TYPE_MORE_INFO}")
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(
                title="More-Info",
                data={CONF_ENTRY_TYPE: ENTRY_TYPE_MORE_INFO},
                options=_automatic_detail_options_from_input(user_input),
            )
        return self.async_show_form(
            step_id="more_info",
            data_schema=_more_info_schema(DEFAULT_MORE_INFO_OPTIONS),
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Reconfigure the service selected from its integration-entry cog."""
        entry = self._get_reconfigure_entry()
        if config_entry_type(entry) == ENTRY_TYPE_MORE_INFO:
            return await self.async_step_reconfigure_more_info(user_input)

        if user_input is not None:
            user_input = _automatic_detail_options_from_input(
                user_input, dict(entry.options)
            )
            user_input[CONF_ENTITY_OPTIONS] = entry.options.get(
                CONF_ENTITY_OPTIONS, {}
            )
            return self.async_update_reload_and_abort(
                entry,
                title=DEFAULT_OPTIONS[CONF_TITLE],
                options=user_input,
            )
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=_panel_schema(options_with_defaults(entry.options)),
        )

    async def async_step_reconfigure_more_info(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Reconfigure the independent More-Info service entry."""
        entry = self._get_reconfigure_entry()
        if user_input is not None:
            user_input = _automatic_detail_options_from_input(
                user_input, dict(entry.options)
            )
            return self.async_update_reload_and_abort(
                entry,
                title="More-Info",
                options=user_input,
            )
        return self.async_show_form(
            step_id="reconfigure_more_info",
            data_schema=_more_info_schema(
                more_info_options_with_defaults(entry.options)
            ),
        )

    @staticmethod
    def async_get_options_flow(config_entry: ConfigEntry):
        """Return the options flow."""
        return AdvancedHistoryOptionsFlow()


class AdvancedHistoryOptionsFlow(OptionsFlowWithReload):
    """Handle Advanced History service options."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Edit the selected service entry's options."""
        if config_entry_type(self.config_entry) == ENTRY_TYPE_MORE_INFO:
            if user_input is not None:
                user_input = _automatic_detail_options_from_input(
                    user_input, dict(self.config_entry.options)
                )
                return self.async_create_entry(title="", data=user_input)
            return self.async_show_form(
                step_id="init",
                data_schema=_more_info_schema(
                    more_info_options_with_defaults(self.config_entry.options)
                ),
            )

        if user_input is not None:
            user_input = _automatic_detail_options_from_input(
                user_input, dict(self.config_entry.options)
            )
            user_input[CONF_ENTITY_OPTIONS] = self.config_entry.options.get(
                CONF_ENTITY_OPTIONS, {}
            )
            return self.async_create_entry(title="", data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=_panel_schema(options_with_defaults(self.config_entry.options)),
        )
