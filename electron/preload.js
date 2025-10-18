const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Fetch posts
  fetchBooru: (payload) => ipcRenderer.invoke('booru:fetch', payload),

  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),

  // External
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),

  // Single image download
  downloadImage: ({ url, siteName, fileName }) =>
    ipcRenderer.invoke('download:image', { url, siteName, fileName }),

  // BULK download
  downloadBulk: (items, options = {}) =>
    ipcRenderer.invoke('download:bulk', { items, options }),

  // Image proxy (to data URL)
  proxyImage: (url) => ipcRenderer.invoke('image:proxy', { url }),

  // Favorites remote
  booruFavorite: (payload) => ipcRenderer.invoke('booru:favorite', payload),

  // Favorites local
  favKeys: () => ipcRenderer.invoke('favorites:keys'),
  favList: () => ipcRenderer.invoke('favorites:list'),
  favToggle: (post) => ipcRenderer.invoke('favorites:toggle', { post }),
  favClear: () => ipcRenderer.invoke('favorites:clear'),

  // Optional helpers
  authCheck: (site) => ipcRenderer.invoke('booru:authCheck', { site }),
  rateLimit: (site) => ipcRenderer.invoke('booru:rateLimit', { site })
});
