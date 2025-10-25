'use strict';

const { contextBridge, ipcRenderer, shell } = require('electron');

// Normalize site argument for helpers that accept either a site object or { site }
const pickSite = (arg) => (arg && typeof arg === 'object' && 'site' in arg ? arg.site : arg);

contextBridge.exposeInMainWorld('api', {
  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),

  // Fetch posts
  fetchBooru: (payload) => ipcRenderer.invoke('booru:fetch', payload),

  // External/open
  openExternal: async (url) => {
    try { await shell.openExternal(url); return true; }
    catch { try { return await ipcRenderer.invoke('openExternal', url); } catch { return false; } }
  },

  // Images
  downloadImage: ({ url, siteName, fileName }) => ipcRenderer.invoke('download:image', { url, siteName, fileName }),
  downloadBulk: (items, options = {}) => ipcRenderer.invoke('download:bulk', { items, options }),
  proxyImage: (url) => ipcRenderer.invoke('image:proxy', { url }),

  // Site helpers
  booruFavorite: (payload) => ipcRenderer.invoke('booru:favorite', payload),
  favoritePost: (payload) => ipcRenderer.invoke('booru:favorite', payload),
  authCheck: (siteOrPayload) => ipcRenderer.invoke('booru:authCheck', { site: pickSite(siteOrPayload) }),
  rateLimit: (siteOrPayload) => ipcRenderer.invoke('booru:rateLimit', { site: pickSite(siteOrPayload) }),
  rateLimitCheck: (siteOrPayload) => ipcRenderer.invoke('booru:rateLimit', { site: pickSite(siteOrPayload) }),

  // Local favorites
  favKeys: () => ipcRenderer.invoke('favorites:keys'),
  favList: () => ipcRenderer.invoke('favorites:list'),
  favToggle: (post) => ipcRenderer.invoke('favorites:toggle', { post }),
  favClear: () => ipcRenderer.invoke('favorites:clear'),
  getLocalFavoriteKeys: () => ipcRenderer.invoke('favorites:keys'),
  getLocalFavorites: () => ipcRenderer.invoke('favorites:list'),
  toggleLocalFavorite: (post) => ipcRenderer.invoke('favorites:toggle', { post }),
  clearLocalFavorites: () => ipcRenderer.invoke('favorites:clear'),

  // Account + sync (requires main with account IPC)
  accountGet: () => ipcRenderer.invoke('account:get'),
  accountSetServer: (base) => ipcRenderer.invoke('account:setServer', base),
  accountRegister: (username, password) => ipcRenderer.invoke('account:register', { username, password }),
  accountLoginLocal: (username, password) => ipcRenderer.invoke('account:loginLocal', { username, password }),
  accountLoginDiscord: () => ipcRenderer.invoke('account:loginDiscord'),
  accountLogout: () => ipcRenderer.invoke('account:logout'),
  syncOnLogin: () => ipcRenderer.invoke('sync:onLogin'),
  syncPullFavorites: () => ipcRenderer.invoke('sync:fav:pull'),
  sitesGetRemote: () => ipcRenderer.invoke('sites:getRemote'),
  sitesSaveRemote: (sites) => ipcRenderer.invoke('sites:saveRemote', sites),

  // New: Link Discord (starts OAuth and waits for callback)
  accountLinkDiscord: () => ipcRenderer.invoke('account:linkDiscord'),
});

contextBridge.exposeInMainWorld('events', {
  onConfigChanged: (cb) => ipcRenderer.on('config:changed', (_e, cfg) => { try { cb?.(cfg); } catch {} }),
  onFavoritesChanged: (cb) => ipcRenderer.on('favorites:changed', () => { try { cb?.(); } catch {} }),
});