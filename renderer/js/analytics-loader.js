(function (global) {
  'use strict';

  function isWebHostedAnalytics() {
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) return false;
    if (global.Capacitor?.getPlatform?.() === 'android') return false;
    return true;
  }

  const noopConsent = {
    hasConsent: () => false,
    getConsentPreferences: () => ({ necessary: true, analytics: false }),
    getConsentRecord: () => null,
    saveConsentPreferences: () => {},
    withdrawOptionalConsent: () => {},
    onConsentChange: () => () => {},
    openCookiePreferences: () => {},
    initializeConsentBanner: () => {},
    initializeConsentRecordPanel: () => {},
    buildLoginPayload: () => null
  };

  const noopAnalytics = {
    init: async () => {},
    getLoginPayload: async () => ({}),
    linkAfterAuth: async () => {},
    trackEvent: () => {},
    updateLoginDisclosure: () => {},
    getAuthToken: () => null,
    setAuthToken: () => {},
    getPlatformLabel: () => 'unknown'
  };

  global.SBWebAnalytics = { enabled: isWebHostedAnalytics };
  global.SBConsent = global.SBConsent || noopConsent;
  global.SBAnalytics = global.SBAnalytics || noopAnalytics;

  function injectStylesheet(href) {
    if (!href || document.querySelector(`link[data-atlas-analytics-css="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-atlas-analytics-css', href);
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (!src) return resolve(false);
      if (document.querySelector(`script[data-atlas-analytics-src="${src}"]`)) return resolve(true);
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute('data-atlas-analytics-src', src);
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function bootstrapPrivateBundle() {
    if (!isWebHostedAnalytics()) return;

    if (!global.__ATLAS_ANALYTICS__) {
      global.__ATLAS_ANALYTICS__ = {
        appId: 'streambooru',
        storageKey: 'sb_cookie_preferences_v1',
        accountSyncStorageKey: 'sb_cookie_preferences_v1_account_sync',
        cookiePolicyPath: '/cookie-policy',
        getServerBase() {
          try {
            const acc = JSON.parse(localStorage.getItem('sb_account_v1') || '{}');
            if (acc.serverBase) return String(acc.serverBase).replace(/\/+$/, '');
          } catch {}
          if (window.location?.pathname?.startsWith('/app')) {
            return window.location.origin.replace(/\/+$/, '');
          }
          return window.location.origin.replace(/\/+$/, '');
        },
        getAuthToken() {
          try {
            const acc = JSON.parse(localStorage.getItem('sb_account_v1') || '{}');
            return acc.token || null;
          } catch {
            return null;
          }
        },
        setAuthToken(token) {
          try {
            const acc = JSON.parse(localStorage.getItem('sb_account_v1') || '{}');
            if (token) acc.token = token;
            else delete acc.token;
            localStorage.setItem('sb_account_v1', JSON.stringify(acc));
          } catch {}
        },
        getPlatformLabel: () => 'web',
        loginDisclosureText: 'Analytics is enabled. If you sign in, we may link this login to your current AtlasAnalytics session using your username and limited login context. We use this to understand account journeys, diagnose errors, and help protect the service.'
      };
    }

    const base = './analytics-private';
    injectStylesheet(`${base}/cookie-consent.css`);
    try {
      await loadScript(`${base}/config.js`);
      await loadScript(`${base}/swetrix.js`);
      await loadScript(`${base}/consent.js`);
      await loadScript(`${base}/analytics-client.js`);
      global.SBConsent = global.AtlasConsent || global.SBConsent;
      global.SBAnalytics = global.AtlasAnalytics || global.SBAnalytics;
      if (global.SBAnalytics?.init) await global.SBAnalytics.init();
    } catch {
      // Private AtlasAnalytics bundle not present (expected for OSS-only web builds).
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapPrivateBundle);
  } else {
    bootstrapPrivateBundle();
  }
})(typeof window !== 'undefined' ? window : globalThis);
