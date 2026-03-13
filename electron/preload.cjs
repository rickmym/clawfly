const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // User discovery
  getOnlineUsers: () => ipcRenderer.invoke('get-online-users'),
  onUserJoined: (callback) => {
    ipcRenderer.on('user-joined', (event, user) => callback(user));
  },
  onUserLeft: (callback) => {
    ipcRenderer.on('user-left', (event, userId) => callback(userId));
  },

  // Messaging
  sendMessage: (targetIp, content) =>
    ipcRenderer.invoke('send-message', { targetIp, content }),
  getMessages: (userId) =>
    ipcRenderer.invoke('get-messages', { userId }),
  onMessageReceived: (callback) => {
    ipcRenderer.on('message-received', (event, message) => callback(message));
  },

  // File transfer
  sendFile: (targetIp, filePath) =>
    ipcRenderer.invoke('send-file', { targetIp, filePath }),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDownloadPath: () => ipcRenderer.invoke('get-download-path'),
  onTransferProgress: (callback) => {
    ipcRenderer.on('transfer-progress', (event, progress) => callback(progress));
  },
  onTransferComplete: (callback) => {
    ipcRenderer.on('transfer-complete', (event, result) => callback(result));
  },

  // User info
  updateUserInfo: (userName) =>
    ipcRenderer.invoke('update-user-info', { userName }),

  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),

  // App control
  quit: () => ipcRenderer.invoke('quit-app'),
});
