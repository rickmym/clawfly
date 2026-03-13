// Type definitions for Electron API exposed via preload

export interface DeviceInfo {
  id: string;
  name: string;
  host: string;
  os: string;
  ip: string;
  port: number;
  version: string;
  lastSeen: number;
}

export interface Message {
  id: string;
  from: string;
  fromName?: string;
  fromIp?: string;
  to: string;
  content: string;
  type: 'text' | 'file';
  timestamp: number;
}

export interface TransferProgress {
  fileId: string;
  fileName?: string;
  bytesReceived?: number;
  bytesSent?: number;
  totalSize: number;
  status: 'sending' | 'receiving' | 'paused' | 'complete';
}

export interface Transfer {
  fileId: string;
  fileName: string;
  totalSize: number;
  bytesTransferred: number;
  status: 'pending' | 'sending' | 'receiving' | 'complete' | 'failed';
  direction: 'upload' | 'download';
  targetIp?: string;
  targetName?: string;
}

export interface AppInfo {
  name: string;
  version: string;
  userId: string;
  userName: string;
  hostName: string;
  os: string;
  ip: string;
  port: number;
  filePort: number;
}

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>;
  getOnlineUsers: () => Promise<DeviceInfo[]>;
  onUserJoined: (callback: (user: DeviceInfo) => void) => void;
  onUserLeft: (callback: (userId: string) => void) => void;
  sendMessage: (targetIp: string, content: string) => Promise<{ success: boolean; error?: string }>;
  getMessages: (userId: string) => Promise<Message[]>;
  onMessageReceived: (callback: (message: Message) => void) => void;
  sendFile: (targetIp: string, filePath: string) => Promise<{ success: boolean; fileId?: string; fileName?: string; error?: string }>;
  selectFiles: () => Promise<string[]>;
  selectFolder: () => Promise<string | null>;
  getDownloadPath: () => Promise<string>;
  onTransferProgress: (callback: (progress: TransferProgress) => void) => void;
  onTransferComplete: (callback: (result: { fileId: string; fileName: string; path?: string }) => void) => void;
  updateUserInfo: (userName: string) => Promise<{ success: boolean }>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  quit: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
