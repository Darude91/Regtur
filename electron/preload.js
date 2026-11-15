// Brug tussen de web-app en Windows: externe spelers (VLC, mpv, …) starten en vinden.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kdNative', {
  detectPlayers: () => ipcRenderer.invoke('kd:detectPlayers'),
  browsePlayer: () => ipcRenderer.invoke('kd:browsePlayer'),
  openPlayer: opts => ipcRenderer.invoke('kd:openPlayer', opts),
});
