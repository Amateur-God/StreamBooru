const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),

  // Fetch posts
  fetchBooru: (payload) => ipcRenderer.invoke('booru:fetch', payload),

  // External/open
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

  // Images
  downloadImage: (payload) => ipcRenderer.invoke('download:image', payload),
  proxyImage: (url) => ipcRenderer.invoke('image:proxy', { url }),

  // Remote favorites (site APIs)
  favoritePost: (payload) => ipcRenderer.invoke('booru:favorite', payload),

  // NEW: auth check (returns {supported, ok, info?, reason?})
  authCheck: (payload) => ipcRenderer.invoke('booru:authCheck', payload),

  // NEW: rate-limit check (Danbooru) (returns {ok, headers:{}, limit?, remaining?, reset?})
  rateLimitCheck: (payload) => ipcRenderer.invoke('booru:rateLimit', payload),

  // Local favorites (app storage)
  getLocalFavoriteKeys: () => ipcRenderer.invoke('favorites:keys'),
  getLocalFavorites: () => ipcRenderer.invoke('favorites:list'),
  toggleLocalFavorite: (post) => ipcRenderer.invoke('favorites:toggle', { post }),
  clearLocalFavorites: () => ipcRenderer.invoke('favorites:clear')
});
