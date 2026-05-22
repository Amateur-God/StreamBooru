const ANALYTICS_CONSENT_VERSION = 'sb-v1.0 - 22 May 2026';

function attachAnalytics(_req, _res, next) {
  next();
}

function getPublicAnalyticsConfig() {
  return {
    consentVersion: ANALYTICS_CONSENT_VERSION,
    requireConsent: true,
    openpanelEnabled: false,
    openpanelClientId: '',
    openpanelApiUrl: '',
    openpanelScriptSrc: '',
    swetrixEnabled: false,
    swetrixProjectId: '',
    swetrixApiUrl: '',
    swetrixRespectDnt: false,
    swetrixDevMode: false
  };
}

async function handleAuthAnalytics() {}

module.exports = {
  ANALYTICS_CONSENT_VERSION,
  attachAnalytics,
  getPublicAnalyticsConfig,
  handleAuthAnalytics,
  identifyLoginAnalyticsUser: () => null,
  recordUserConsent: async () => null
};
