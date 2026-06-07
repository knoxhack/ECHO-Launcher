const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('echoNative', {
  invoke(command, payload) {
    return ipcRenderer.invoke('echo:invoke', command, payload ?? {})
  },
})
