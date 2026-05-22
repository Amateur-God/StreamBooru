const fs = require('fs');
const path = require('path');

function loadAnalyticsModule() {
  const candidates = [
    path.join(__dirname, '_analytics_private', 'index.js'),
    path.join(__dirname, '_analytics_private', 'analytics.js'),
    path.join(__dirname, '..', 'private', 'atlas-analytics', 'server', 'index.js'),
    path.join(__dirname, '..', 'private', 'atlas-analytics', 'server', 'analytics.js')
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return require(candidate);
    } catch (error) {
      console.warn('[Analytics] Failed to load private module:', error?.message || error);
    }
  }
  return require('./analytics-noop');
}

module.exports = loadAnalyticsModule();
