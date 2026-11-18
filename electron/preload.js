// Brug tussen de web-app en Windows: externe spelers (VLC, mpv, …) starten en vinden.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kdNative', {
  detectPlayers: () => ipcRenderer.invoke('kd:detectPlayers'),
  browsePlayer: () => ipcRenderer.invoke('kd:browsePlayer'),
  openPlayer: opts => ipcRenderer.invoke('kd:openPlayer', opts),
  mpvAvailable: () => ipcRenderer.invoke('kd:mpvAvailable'),
  mpvPlay: o => ipcRenderer.invoke('kd:mpvPlay', o),
  mpvSub: (u, lang) => ipcRenderer.invoke('kd:mpvSub', u, lang),
  mpvStop: () => ipcRenderer.invoke('kd:mpvStop'),
  onMpv: cb => ipcRenderer.on('kd:mpv', (_e, d) => cb(d)),
  remoteStart: o => ipcRenderer.invoke('kd:remoteStart', o),
  remoteStop: () => ipcRenderer.invoke('kd:remoteStop'),
  remoteInfo: () => ipcRenderer.invoke('kd:remoteInfo'),
  remoteScan: () => ipcRenderer.invoke('kd:remoteScan'),
  remoteSend: o => ipcRenderer.invoke('kd:remoteSend', o),
  onRemotePlay: cb => ipcRenderer.on('kd:remotePlay', (_e, d) => cb(d)),
  movieHash: u => ipcRenderer.invoke('kd:movieHash', u),
  download: o => ipcRenderer.invoke('kd:download', o),
  pauseDownload: id => ipcRenderer.invoke('kd:dlpause', id),
  removeDownload: id => ipcRenderer.invoke('kd:dlremove', id),
  openDownloads: () => ipcRenderer.invoke('kd:dlfolder'),
  onDownloadProgress: cb => ipcRenderer.on('kd:dlprogress', (_e, d) => cb(d)),
});
