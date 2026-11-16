// Brug tussen de web-app en Windows: externe spelers (VLC, mpv, …) starten en vinden.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kdNative', {
  detectPlayers: () => ipcRenderer.invoke('kd:detectPlayers'),
  browsePlayer: () => ipcRenderer.invoke('kd:browsePlayer'),
  openPlayer: opts => ipcRenderer.invoke('kd:openPlayer', opts),
  download: o => ipcRenderer.invoke('kd:download', o),
  pauseDownload: id => ipcRenderer.invoke('kd:dlpause', id),
  removeDownload: id => ipcRenderer.invoke('kd:dlremove', id),
  openDownloads: () => ipcRenderer.invoke('kd:dlfolder'),
  onDownloadProgress: cb => ipcRenderer.on('kd:dlprogress', (_e, d) => cb(d)),
});
