export const INTEGRATIONS_MODULE_ID = "integrations"

/**
 * Reserved module_settings id for the per-user update-check stamp
 * ({ lastCheckedAt }). Not a real module — same convention as "__license__".
 */
export const UPDATE_CHECK_MODULE_ID = "__update_check__"

/**
 * Reserved module_settings id for per-user API request-logging config
 * ({ retentionDays }). Not a real module — same convention as "__license__"
 * and UPDATE_CHECK_MODULE_ID above.
 */
export const API_LOGGING_MODULE_ID = "__api_logging__"

/** Public docs page for configuring AI provider / integration API keys. */
export const API_INTEGRATIONS_DOCS_URL = "https://ari.software/docs/api-integrations"
