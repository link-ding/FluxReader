const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  searchBooks: (books, query) => ipcRenderer.invoke('search-books', books, query),
  chatWithAI: (payload) => ipcRenderer.invoke('ai-chat', payload),
  buildSemanticSearchMap: (payload) => ipcRenderer.invoke('ai-semantic-search-map', payload),
  explainSemanticTheme: (payload) => ipcRenderer.invoke('ai-explain-semantic-theme', payload),
  buildAIIndex: (payload) => ipcRenderer.invoke('ai-build-index', payload),
  onAIIndexProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('ai-index-progress', handler);
    return () => ipcRenderer.removeListener('ai-index-progress', handler);
  },
  getFileBuffer: (filePath) => ipcRenderer.invoke('get-file-buffer', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  storeGet: () => ipcRenderer.invoke('store-get'),
  storeSet: (data) => ipcRenderer.invoke('store-set', data),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
});
