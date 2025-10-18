'use strict';

const { contextBridge, ipcRenderer, shell } = require('electron');

// Normalize site argument for helpers that accept either a site object or { site }
const pickSite = (arg) => (arg && typeof arg === 'object' && 'site' in arg ? arg.site : arg);

contextBridge.exposeInMainWorld('api', {
  // ---------------- Config ----------------
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),

  // ---------------- Fetch posts ----------------
  fetchBooru: (payload) => ipcRenderer.invoke('booru:fetch', payload),

  // ---------------- External/open ----------------
  // Prefer shell.openExternal, fall back to a main-process handler
  openExternal: async (url) => {
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      try {
        return await ipcRenderer.invoke('openExternal', url);
      } catch {
        return false;
      }
    }
  },

  // ---------------- Images ----------------
  // Single image download
  downloadImage: ({ url, siteName, fileName }) =>
    ipcRenderer.invoke('download:image', { url, siteName, fileName }),

  // Bulk download
  downloadBulk: (items, options = {}) =>
    ipcRenderer.invoke('download:bulk', { items, options }),

  // Image proxy (to data URL)
  proxyImage: (url) => ipcRenderer.invoke('image:proxy', { url }),

  // ---------------- Remote favorites (site APIs) ----------------
  // New name kept
  booruFavorite: (payload) => ipcRenderer.invoke('booru:favorite', payload),
  // Back-compat alias
  favoritePost: (payload) => ipcRenderer.invoke('booru:favorite', payload),

  // ---------------- helpers ----------------
  // Accept (site) or ({ site })
  authCheck: (siteOrPayload) =>
    ipcRenderer.invoke('booru:authCheck', { site: pickSite(siteOrPayload) }),

  // New helper name
  rateLimit: (siteOrPayload) =>
    ipcRenderer.invoke('booru:rateLimit', { site: pickSite(siteOrPayload) }),
  // Back-compat alias used in older code
  rateLimitCheck: (siteOrPayload) =>
    ipcRenderer.invoke('booru:rateLimit', { site: pickSite(siteOrPayload) }),

  // ---------------- Local favorites (app storage) ----------------
  // New short names
  favKeys: () => ipcRenderer.invoke('favorites:keys'),
  favList: () => ipcRenderer.invoke('favorites:list'),
  favToggle: (post) => ipcRenderer.invoke('favorites:toggle', { post }),
  favClear: () => ipcRenderer.invoke('favorites:clear'),

  getLocalFavoriteKeys: () => ipcRenderer.invoke('favorites:keys'),
  getLocalFavorites: () => ipcRenderer.invoke('favorites:list'),
  toggleLocalFavorite: (post) => ipcRenderer.invoke('favorites:toggle', { post }),
  clearLocalFavorites: () => ipcRenderer.invoke('favorites:clear'),
});
