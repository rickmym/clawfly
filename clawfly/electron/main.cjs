const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell, Notification } = require('electron');
const path = require('path');
const log = require('electron-log/main');
const { networkInterfaces } = require('os');
const dgram = require('dgram');
const net = require('net');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configure logging
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('Clawfly starting...');

// Global exception handler
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

// App configuration
const APP_NAME = 'Clawfly';
const APP_VERSION = '1.0.0';
const BROADCAST_PORT = 2425;
const MESSAGE_PORT = 2426;
const FILE_TRANSFER_PORT = 2427;

// Protocol commands (compatible with IPMsg/OpenClaw)
const CMD = {
  ENTRY: 1,        // User entry
  EXIT: 2,         // User exit
  ANSWER: 3,       // Answer to entry
  SENDMSG: 16,     // Send message
  RECVMSG: 17,     // Receive message
  GETINFO: 32,     // Get user info
  GETLIST: 33,     // Get user list
  FILE_OFFER: 64,  // File offer
  FILE_ACCEPT: 65, // File accept
  FILE_REJECT: 66, // File reject
  FILE_DATA: 67,   // File data
  FILE_COMPLETE: 68, // File complete
  GET_FILE: 72,    // Get file
};

let mainWindow = null;
let tray = null;
let udpServer = null;
let tcpMessageServer = null;
let tcpFileServer = null;

// App state
const state = {
  userId: uuidv4(),
  userName: require('os').userInfo().username,
  hostName: require('os').hostname(),
  os: process.platform,
  ip: '',
  port: MESSAGE_PORT,
  filePort: FILE_TRANSFER_PORT,
  onlineUsers: new Map(),
  messages: [],
  transfers: new Map(),
};

// Get local IP address
function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

// Initialize app state
state.ip = getLocalIP();
log.info(`Local IP: ${state.ip}`);
log.info(`User: ${state.userName}@${state.hostName}`);

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // Load the app
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log.info('Main window ready');
  });

  mainWindow.on('close', (event) => {
    if (tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create system tray
function createTray() {
  const iconPath = path.join(__dirname, '../public/icon.png');
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a simple icon if none exists
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Clawfly', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Online', type: 'radio', checked: true },
    { label: 'Away', type: 'radio' },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      tray = null;
      app.quit();
    }}
  ]);

  tray.setToolTip(`${APP_NAME} - ${state.userName}`);
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
  });
}

// UDP Broadcast for user discovery
function startUDPServer() {
  udpServer = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  udpServer.on('error', (err) => {
    log.error('UDP Server error:', err);
    udpServer.close();
  });

  udpServer.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      handleUDPMessage(data, rinfo);
    } catch (e) {
      log.warn('Failed to parse UDP message:', e);
    }
  });

  udpServer.on('listening', () => {
    const address = udpServer.address();
    log.info(`UDP Server listening on ${address.address}:${address.port}`);
    udpServer.setBroadcast(true);

    // Broadcast entry message
    broadcastEntry();

    // Set up heartbeat
    setInterval(broadcastEntry, 30000);
  });

  udpServer.bind(BROADCAST_PORT);
}

// Handle incoming UDP messages
function handleUDPMessage(data, rinfo) {
  const { cmd, userId, userName, hostName, os, ip, port, version } = data;

  // Ignore own messages
  if (userId === state.userId) return;

  switch (cmd) {
    case CMD.ENTRY:
    case CMD.ANSWER:
      // Add or update user
      const user = {
        id: userId,
        name: userName,
        host: hostName,
        os: os,
        ip: ip || rinfo.address,
        port: port || MESSAGE_PORT,
        version: version || '1.0',
        lastSeen: Date.now(),
      };
      state.onlineUsers.set(userId, user);
      mainWindow?.webContents.send('user-joined', user);
      log.info(`User joined: ${userName}@${hostName} (${user.ip})`);

      // Send answer if this is an entry message
      if (cmd === CMD.ENTRY) {
        sendUDPMessage(CMD.ANSWER, { ip: state.ip, port: state.port });
      }
      break;

    case CMD.EXIT:
      state.onlineUsers.delete(userId);
      mainWindow?.webContents.send('user-left', userId);
      log.info(`User left: ${userName}`);
      break;
  }
}

// Send UDP broadcast message
function broadcastEntry() {
  const message = {
    cmd: CMD.ENTRY,
    userId: state.userId,
    userName: state.userName,
    hostName: state.hostName,
    os: state.os,
    ip: state.ip,
    port: state.port,
    version: APP_VERSION,
  };
  sendBroadcast(message);
}

// Send broadcast to all interfaces
function sendBroadcast(message) {
  if (!udpServer) return;

  const data = Buffer.from(JSON.stringify(message));

  // Broadcast to all interfaces
  const broadcastAddresses = getBroadcastAddresses();

  broadcastAddresses.forEach(addr => {
    udpServer.send(data, BROADCAST_PORT, addr, (err) => {
      if (err) {
        log.warn(`Broadcast to ${addr} failed:`, err.message);
      }
    });
  });
}

// Send UDP message to specific address
function sendUDPMessage(cmd, options = {}) {
  if (!udpServer) return;

  const message = {
    cmd,
    userId: state.userId,
    userName: state.userName,
    hostName: state.hostName,
    os: state.os,
    ip: state.ip,
    port: state.port,
    version: APP_VERSION,
    ...options,
  };

  const data = Buffer.from(JSON.stringify(message));

  // Get all known user IPs
  state.onlineUsers.forEach((user) => {
    udpServer.send(data, BROADCAST_PORT, user.ip, (err) => {
      if (err) {
        log.warn(`UDP message to ${user.ip} failed:`, err.message);
      }
    });
  });
}

// Get broadcast addresses for all network interfaces
function getBroadcastAddresses() {
  const addresses = ['255.255.255.255'];
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && net.netmask) {
        // Calculate broadcast address
        const ip = net.address.split('.').map(Number);
        const mask = net.netmask.split('.').map(Number);
        const broadcast = ip.map((octet, i) => octet | (~mask[i] & 255));
        addresses.push(broadcast.join('.'));
      }
    }
  }

  return [...new Set(addresses)];
}

// TCP Message Server
function startTCPMessageServer() {
  tcpMessageServer = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Handle complete messages (newline delimited)
      const messages = buffer.split('\n');
      buffer = messages.pop();

      messages.forEach(msgStr => {
        if (msgStr.trim()) {
          try {
            const msg = JSON.parse(msgStr);
            handleTCPMessage(msg, socket);
          } catch (e) {
            log.warn('Failed to parse TCP message:', e);
          }
        }
      });
    });

    socket.on('error', (err) => {
      log.warn('TCP socket error:', err.message);
    });
  });

  tcpMessageServer.on('error', (err) => {
    log.error('TCP Message Server error:', err);
  });

  tcpMessageServer.listen(state.port, () => {
    log.info(`TCP Message Server listening on port ${state.port}`);
  });
}

// Handle incoming TCP messages
function handleTCPMessage(msg, socket) {
  if (msg.cmd === CMD.SENDMSG) {
    const message = {
      id: uuidv4(),
      from: msg.from,
      fromIp: socket.remoteAddress,
      to: state.userId,
      content: msg.content,
      type: 'text',
      timestamp: Date.now(),
    };

    state.messages.push(message);
    mainWindow?.webContents.send('message-received', message);

    // Send delivery receipt
    const receipt = JSON.stringify({ cmd: CMD.RECVMSG, msgId: message.id }) + '\n';
    socket.write(receipt);

    // Show notification
    if (Notification.isSupported()) {
      new Notification({
        title: `Message from ${msg.fromName}`,
        body: msg.content.substring(0, 100),
      }).show();
    }
  }
}

// TCP File Transfer Server
function startTCPFileServer() {
  tcpFileServer = net.createServer((socket) => {
    let buffer = null;
    let fileStream = null;
    let fileInfo = null;
    let bytesReceived = 0;

    socket.on('data', (data) => {
      // First packet contains file info header
      if (!fileInfo) {
        try {
          const headerEnd = data.indexOf('\n');
          if (headerEnd > -1) {
            const header = JSON.parse(data.slice(0, headerEnd).toString());
            fileInfo = header;
            bytesReceived = 0;

            // Create write stream
            const savePath = path.join(app.getPath('downloads'), fileInfo.fileName);
            fileStream = fs.createWriteStream(savePath);

            // Send acceptance
            socket.write(JSON.stringify({
              cmd: CMD.FILE_ACCEPT,
              fileId: fileInfo.fileId,
              offset: 0
            }) + '\n');

            // Write remaining data
            const remaining = data.slice(headerEnd + 1);
            if (remaining.length > 0) {
              fileStream.write(remaining);
              bytesReceived += remaining.length;
            }

            // Update transfer state
            mainWindow?.webContents.send('transfer-progress', {
              fileId: fileInfo.fileId,
              bytesReceived,
              totalSize: fileInfo.fileSize,
              status: 'receiving',
            });
          }
        } catch (e) {
          log.error('File transfer header error:', e);
        }
      } else {
        // Continue writing file data
        if (fileStream) {
          fileStream.write(data);
          bytesReceived += data.length;

          mainWindow?.webContents.send('transfer-progress', {
            fileId: fileInfo.fileId,
            bytesReceived,
            totalSize: fileInfo.fileSize,
            status: 'receiving',
          });

          // Check if complete
          if (bytesReceived >= fileInfo.fileSize) {
            fileStream.end();
            mainWindow?.webContents.send('transfer-complete', {
              fileId: fileInfo.fileId,
              fileName: fileInfo.fileName,
              path: path.join(app.getPath('downloads'), fileInfo.fileName),
            });
          }
        }
      }
    });

    socket.on('error', (err) => {
      log.error('File transfer socket error:', err);
      if (fileStream) fileStream.end();
    });

    socket.on('close', () => {
      if (fileStream) fileStream.end();
    });
  });

  tcpFileServer.on('error', (err) => {
    log.error('TCP File Server error:', err);
  });

  tcpFileServer.listen(state.filePort, () => {
    log.info(`TCP File Server listening on port ${state.filePort}`);
  });
}

// Send file to recipient
function sendFile(targetIp, filePath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;
    const fileId = uuidv4();

    const client = new net.Socket();

    client.connect(state.filePort, targetIp, () => {
      // Send file offer header
      const header = JSON.stringify({
        cmd: CMD.FILE_OFFER,
        fileId,
        fileName,
        fileSize,
        from: state.userName,
      }) + '\n';

      client.write(header);

      // Read and send file
      const readStream = fs.createReadStream(filePath);
      let bytesSent = 0;

      readStream.on('data', (chunk) => {
        client.write(chunk);
        bytesSent += chunk.length;

        mainWindow?.webContents.send('transfer-progress', {
          fileId,
          fileName,
          bytesSent,
          totalSize: fileSize,
          status: 'sending',
        });
      });

      readStream.on('end', () => {
        client.end();
        mainWindow?.webContents.send('transfer-complete', {
          fileId,
          fileName,
        });
        resolve({ fileId, fileName });
      });

      readStream.on('error', (err) => {
        client.destroy();
        reject(err);
      });
    });

    client.on('error', (err) => {
      reject(err);
    });
  });
}

// Send text message to recipient
function sendMessage(targetIp, content, fromName) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    client.connect(state.port, targetIp, () => {
      const message = JSON.stringify({
        cmd: CMD.SENDMSG,
        from: state.userId,
        fromName: state.userName,
        content,
      }) + '\n';

      client.write(message, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.on('close', () => {
      client.destroy();
    });
  });
}

// IPC Handlers
function setupIPC() {
  // Get app info
  ipcMain.handle('get-app-info', () => ({
    name: APP_NAME,
    version: APP_VERSION,
    userId: state.userId,
    userName: state.userName,
    hostName: state.hostName,
    os: state.os,
    ip: state.ip,
    port: state.port,
    filePort: state.filePort,
  }));

  // Get online users
  ipcMain.handle('get-online-users', () => {
    return Array.from(state.onlineUsers.values());
  });

  // Send message
  ipcMain.handle('send-message', async (event, { targetIp, content }) => {
    try {
      await sendMessage(targetIp, content, state.userName);
      return { success: true };
    } catch (err) {
      log.error('Send message error:', err);
      return { success: false, error: err.message };
    }
  });

  // Send file
  ipcMain.handle('send-file', async (event, { targetIp, filePath }) => {
    try {
      const result = await sendFile(targetIp, filePath);
      return { success: true, ...result };
    } catch (err) {
      log.error('Send file error:', err);
      return { success: false, error: err.message };
    }
  });

  // Select files dialog
  ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
    });
    return result.filePaths;
  });

  // Select folder dialog
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.filePaths[0] || null;
  });

  // Get download path
  ipcMain.handle('get-download-path', () => {
    return app.getPath('downloads');
  });

  // Get messages for a user
  ipcMain.handle('get-messages', (event, { userId }) => {
    return state.messages.filter(m =>
      (m.from === userId && m.to === state.userId) ||
      (m.from === state.userId && m.to === userId)
    );
  });

  // Window controls
  ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window-close', () => {
    mainWindow?.hide();
  });

  // Update user info
  ipcMain.handle('update-user-info', (event, { userName }) => {
    if (userName) {
      state.userName = userName;
      broadcastEntry();
    }
    return { success: true };
  });

  // Broadcast exit on quit
  ipcMain.handle('quit-app', () => {
    sendUDPMessage(CMD.EXIT);
    app.quit();
  });
}

// App lifecycle
app.whenReady().then(() => {
  log.info('App ready, initializing...');

  createWindow();
  createTray();
  setupIPC();
  startUDPServer();
  startTCPMessageServer();
  startTCPFileServer();

  log.info(`${APP_NAME} v${APP_VERSION} started successfully`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Broadcast exit message
  sendUDPMessage(CMD.EXIT);

  // Clean up
  if (udpServer) udpServer.close();
  if (tcpMessageServer) tcpMessageServer.close();
  if (tcpFileServer) tcpFileServer.close();
  if (tray) tray.destroy();

  log.info('Clawfly shutting down');
});
