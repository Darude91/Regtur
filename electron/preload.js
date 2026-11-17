// Brug tussen de web-app en Windows: externe spelers (VLC, mpv, …) starten en vinden.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kdNative', {
  detectPlayers: () => ipcRenderer.invoke('kd:detectPlayers'),
  browsePlayer: () => ipcRenderer.invoke('kd:browsePlayer'),
  openPlayer: opts => ipcRenderer.invoke('kd:openPlayer', opts),
  mpvAvailable: () => ipcRenderer.invoke('kd:mpvAvailable'),
  mpvPlay: o => ipcRenderer.invoke('kd:mpvPlay', o),
  mpvSub: u => ipcRenderer.invoke('kd:mpvSub', u),
  mpvStop: () => ipcRenderer.invoke('kd:mpvStop'),
  onMpv: cb => ipcRenderer.on('kd:mpv', (_e, d) => cb(d)),
  download: o => ipcRenderer.invoke('kd:download', o),
  pauseDownload: id => ipcRenderer.invoke('kd:dlpause', id),
  removeDownload: id => ipcRenderer.invoke('kd:dlremove', id),
  openDownloads: () => ipcRenderer.invoke('kd:dlfolder'),
  onDownloadProgress: cb => ipcRenderer.on('kd:dlprogress', (_e, d) => cb(d)),
});
