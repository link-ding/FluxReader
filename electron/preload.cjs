const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  searchBooks: (books, query) => ipcRenderer.invoke('search-books', books, query),
  getFileBuffer: (filePath) => ipcRenderer.invoke('get-file-buffer', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  storeGet: () => ipcRenderer.invoke('store-get'),
  storeSet: (data) => ipcRenderer.invoke('store-set', data),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
});
