const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  fetchSubtitles: (options) => ipcRenderer.invoke('fetch-subtitles', options),
  discordSetPresence: (presence) => ipcRenderer.invoke('discord-set-presence', presence),
  discordClearPresence: () => ipcRenderer.invoke('discord-clear-presence'),
  startNetworkServer: () => ipcRenderer.invoke('network-server-start'),
  stopNetworkServer: () => ipcRenderer.invoke('network-server-stop'),
  getNetworkServerStatus: () => ipcRenderer.invoke('network-server-status'),
  getLocalIPAddress: () => ipcRenderer.invoke('network-get-local-ip')
});

