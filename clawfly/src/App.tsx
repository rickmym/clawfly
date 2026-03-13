import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wifi,
  WifiOff,
  Send,
  Paperclip,
  FolderOpen,
  X,
  Minimize2,
  Maximize2,
  Settings,
  Users,
  File,
  FileText,
  Image,
  Film,
  Download,
  Upload,
  Check,
  CheckCheck,
  Clock,
  Search,
  ChevronRight,
  MessageSquare,
  HardDrive,
  Monitor,
  Laptop,
  Server,
} from 'lucide-react';
import type { DeviceInfo, Message, Transfer, TransferProgress } from './types/electron';
import './App.css';

// Get OS icon based on platform
const getOSIcon = (os: string) => {
  switch (os) {
    case 'win32':
      return <Monitor className="w-4 h-4" />;
    case 'darwin':
      return <Laptop className="w-4 h-4" />;
    case 'linux':
      return <Server className="w-4 h-4" />;
    default:
      return <HardDrive className="w-4 h-4" />;
  }
};

// Get OS name display
const getOSName = (os: string) => {
  switch (os) {
    case 'win32':
      return 'Windows';
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return 'Unknown';
  }
};

// Format file size
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format time
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Get file icon based on extension
const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
  const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv'];
  const docExts = ['doc', 'docx', 'pdf', 'txt', 'rtf', 'odt'];

  if (imageExts.includes(ext)) return <Image className="w-5 h-5 text-blue-400" />;
  if (videoExts.includes(ext)) return <Film className="w-5 h-5 text-purple-400" />;
  if (docExts.includes(ext)) return <FileText className="w-5 h-5 text-green-400" />;
  return <File className="w-5 h-5 text-gray-400" />;
};

function App() {
  // App state
  const [appInfo, setAppInfo] = useState<{
    name: string;
    version: string;
    userId: string;
    userName: string;
    hostName: string;
    os: string;
    ip: string;
  } | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<DeviceInfo[]>([]);
  const [selectedUser, setSelectedUser] = useState<DeviceInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [showTransfers, setShowTransfers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize app
  useEffect(() => {
    const initApp = async () => {
      if (window.electronAPI) {
        const info = await window.electronAPI.getAppInfo();
        setAppInfo(info);
        setEditName(info.userName);

        // Get initial users
        const users = await window.electronAPI.getOnlineUsers();
        setOnlineUsers(users);
      }
    };

    initApp();
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!window.electronAPI) return;

    // User events
    window.electronAPI.onUserJoined((user) => {
      setOnlineUsers((prev) => {
        const exists = prev.find((u) => u.id === user.id);
        if (exists) return prev;
        return [...prev, user];
      });
    });

    window.electronAPI.onUserLeft((userId) => {
      setOnlineUsers((prev) => prev.filter((u) => u.id !== userId));
      if (selectedUser?.id === userId) {
        setSelectedUser(null);
        setMessages([]);
      }
    });

    // Message events
    window.electronAPI.onMessageReceived((message) => {
      if (selectedUser && message.from === selectedUser.id) {
        setMessages((prev) => [...prev, message]);
        scrollToBottom();
      }
    });

    // Transfer events
    window.electronAPI.onTransferProgress((progress) => {
      setTransfers((prev) => {
        const existing = prev.find((t) => t.fileId === progress.fileId);
        if (existing) {
          return prev.map((t) =>
            t.fileId === progress.fileId
              ? {
                  ...t,
                  bytesTransferred: progress.bytesReceived || progress.bytesSent || t.bytesTransferred,
                  status: progress.status === 'receiving' ? 'receiving' : 'sending',
                }
              : t
          );
        }
        return [
          ...prev,
          {
            fileId: progress.fileId,
            fileName: progress.fileName || 'Unknown',
            totalSize: progress.totalSize,
            bytesTransferred: progress.bytesReceived || 0,
            status: 'receiving',
            direction: 'download',
          },
        ];
      });
    });

    window.electronAPI.onTransferComplete((result) => {
      setTransfers((prev) =>
        prev.map((t) =>
          t.fileId === result.fileId
            ? { ...t, status: 'complete', bytesTransferred: t.totalSize }
            : t
        )
      );
    });
  }, [selectedUser]);

  // Load messages when user selected
  useEffect(() => {
    const loadMessages = async () => {
      if (selectedUser && window.electronAPI) {
        const msgs = await window.electronAPI.getMessages(selectedUser.id);
        setMessages(msgs);
        scrollToBottom();
      }
    };
    loadMessages();
  }, [selectedUser]);

  // Scroll to bottom
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Send message
  const sendMessage = async () => {
    if (!messageInput.trim() || !selectedUser || !window.electronAPI) return;

    const content = messageInput.trim();
    setMessageInput('');

    const result = await window.electronAPI.sendMessage(selectedUser.ip, content);

    if (result.success) {
      const newMessage: Message = {
        id: Date.now().toString(),
        from: appInfo?.userId || '',
        fromName: appInfo?.userName,
        to: selectedUser.id,
        content,
        type: 'text',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, newMessage]);
      scrollToBottom();
    }
  };

  // Handle file selection
  const handleFileSelect = async () => {
    if (!window.electronAPI) return;
    const files = await window.electronAPI.selectFiles();
    if (files.length > 0) {
      files.forEach((filePath) => sendFile(filePath));
    }
  };

  // Handle folder selection
  const handleFolderSelect = async () => {
    if (!window.electronAPI) return;
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      sendFile(folder);
    }
  };

  // Send file
  const sendFile = async (filePath: string) => {
    if (!selectedUser || !window.electronAPI) return;

    const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';
    const newTransfer: Transfer = {
      fileId: Date.now().toString(),
      fileName,
      totalSize: 0,
      bytesTransferred: 0,
      status: 'pending',
      direction: 'upload',
      targetIp: selectedUser.ip,
      targetName: selectedUser.name,
    };
    setTransfers((prev) => [...prev, newTransfer]);

    const result = await window.electronAPI.sendFile(selectedUser.ip, filePath);

    if (result.success) {
      setTransfers((prev) =>
        prev.map((t) =>
          t.fileId === newTransfer.fileId
            ? { ...t, status: 'sending' }
            : t
        )
      );
    } else {
      setTransfers((prev) =>
        prev.map((t) =>
          t.fileId === newTransfer.fileId
            ? { ...t, status: 'failed' }
            : t
        )
      );
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (!selectedUser) return;

    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => {
      sendFile((file as any).path);
    });
  };

  // Update username
  const updateUserName = async () => {
    if (!window.electronAPI || !editName.trim()) return;
    await window.electronAPI.updateUserInfo(editName.trim());
    setAppInfo((prev) => prev ? { ...prev, userName: editName.trim() } : null);
    setIsEditingName(false);
  };

  // Window controls
  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  // Filter users by search
  const filteredUsers = onlineUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.host.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.ip.includes(searchQuery)
  );

  return (
    <div
      className="app-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="drag-overlay">
          <Upload className="w-16 h-16 text-blue-500" />
          <p className="mt-4 text-lg font-medium">Drop files to send</p>
        </div>
      )}

      {/* Title bar */}
      <div className="title-bar">
        <div className="title-bar-drag">
          <div className="app-title">
            <Wifi className="w-4 h-4" />
            <span>Clawfly</span>
          </div>
        </div>
        <div className="window-controls">
          <button onClick={handleMinimize} className="window-btn">
            <Minimize2 className="w-4 h-4" />
          </button>
          <button onClick={handleMaximize} className="window-btn">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={handleClose} className="window-btn close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        {/* Sidebar */}
        <div className="sidebar">
          {/* User profile */}
          <div className="user-profile">
            <div className="user-avatar">
              {appInfo?.userName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="user-info">
              {isEditingName ? (
                <div className="edit-name">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && updateUserName()}
                    onBlur={updateUserName}
                    autoFocus
                  />
                </div>
              ) : (
                <div
                  className="user-name"
                  onClick={() => setIsEditingName(true)}
                >
                  {appInfo?.userName || 'User'}
                </div>
              )}
              <div className="user-status">
                <span className="status-dot online"></span>
                <span className="status-text">Online</span>
              </div>
              <div className="user-ip">{appInfo?.ip}</div>
            </div>
          </div>

          {/* Search */}
          <div className="search-box">
            <Search className="w-4 h-4 search-icon" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Users list */}
          <div className="users-list">
            <div className="users-header">
              <Users className="w-4 h-4" />
              <span>Nearby Devices</span>
              <span className="user-count">{filteredUsers.length}</span>
            </div>
            {filteredUsers.length === 0 ? (
              <div className="no-users">
                <WifiOff className="w-8 h-8" />
                <p>No devices found</p>
                <span>Searching on network...</span>
              </div>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={`user-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                  onClick={() => setSelectedUser(user)}
                >
                  <div className="user-item-avatar">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-item-info">
                    <div className="user-item-name">{user.name}</div>
                    <div className="user-item-host">
                      {user.host} · {user.ip}
                    </div>
                  </div>
                  <div className="user-item-os">
                    {getOSIcon(user.os)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bottom actions */}
          <div className="sidebar-actions">
            <button
              className={`action-btn ${showTransfers ? 'active' : ''}`}
              onClick={() => setShowTransfers(!showTransfers)}
            >
              <FolderOpen className="w-5 h-5" />
              <span>Transfers</span>
              {transfers.filter(t => t.status !== 'complete').length > 0 && (
                <span className="badge">{transfers.filter(t => t.status !== 'complete').length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="chat-area">
          {selectedUser ? (
            <>
              {/* Chat header */}
              <div className="chat-header">
                <div className="chat-user-info">
                  <div className="chat-user-avatar">
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="chat-user-details">
                    <div className="chat-user-name">{selectedUser.name}</div>
                    <div className="chat-user-meta">
                      {selectedUser.host} · {getOSName(selectedUser.os)} · {selectedUser.ip}
                    </div>
                  </div>
                </div>
                <div className="chat-actions">
                  <button onClick={handleFileSelect} title="Send file">
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button onClick={handleFolderSelect} title="Send folder">
                    <FolderOpen className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="messages-container">
                {messages.length === 0 ? (
                  <div className="no-messages">
                    <MessageSquare className="w-12 h-12" />
                    <p>No messages yet</p>
                    <span>Start a conversation with {selectedUser.name}</span>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.from === appInfo?.userId;
                    return (
                      <div
                        key={msg.id}
                        className={`message ${isOwn ? 'own' : 'other'}`}
                      >
                        <div className="message-bubble">
                          {!isOwn && (
                            <div className="message-sender">{msg.fromName}</div>
                          )}
                          <div className="message-content">{msg.content}</div>
                          <div className="message-meta">
                            <span className="message-time">
                              {formatTime(msg.timestamp)}
                            </span>
                            {isOwn && (
                              <span className="message-status">
                                <CheckCheck className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="message-input-container">
                <button onClick={handleFileSelect} className="input-action">
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  ref={messageInputRef}
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button
                  onClick={sendMessage}
                  className="send-btn"
                  disabled={!messageInput.trim()}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="no-chat-selected">
              <div className="no-chat-content">
                <MessageSquare className="w-16 h-16" />
                <h2>Welcome to Clawfly</h2>
                <p>Select a device to start chatting or sending files</p>
                <div className="no-chat-features">
                  <div className="feature">
                    <Wifi className="w-5 h-5" />
                    <span>Auto-discovery</span>
                  </div>
                  <div className="feature">
                    <Send className="w-5 h-5" />
                    <span>Instant messaging</span>
                  </div>
                  <div className="feature">
                    <HardDrive className="w-5 h-5" />
                    <span>Fast file transfer</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transfers panel */}
        {showTransfers && (
          <div className="transfers-panel">
            <div className="transfers-header">
              <h3>File Transfers</h3>
              <button onClick={() => setShowTransfers(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="transfers-list">
              {transfers.length === 0 ? (
                <div className="no-transfers">
                  <FolderOpen className="w-8 h-8" />
                  <p>No transfers</p>
                </div>
              ) : (
                transfers.map((transfer) => (
                  <div key={transfer.fileId} className="transfer-item">
                    <div className="transfer-icon">
                      {getFileIcon(transfer.fileName)}
                    </div>
                    <div className="transfer-info">
                      <div className="transfer-name">{transfer.fileName}</div>
                      <div className="transfer-meta">
                        <span className="transfer-direction">
                          {transfer.direction === 'upload' ? (
                            <Upload className="w-3 h-3" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          {transfer.direction === 'upload' ? 'Sending' : 'Receiving'}
                        </span>
                        {transfer.targetName && (
                          <span className="transfer-to">to {transfer.targetName}</span>
                        )}
                      </div>
                      <div className="transfer-progress">
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${(transfer.bytesTransferred / transfer.totalSize) * 100 || 0}%`,
                            }}
                          ></div>
                        </div>
                        <div className="progress-text">
                          {formatFileSize(transfer.bytesTransferred)} / {formatFileSize(transfer.totalSize)}
                        </div>
                      </div>
                    </div>
                    <div className="transfer-status">
                      {transfer.status === 'complete' && (
                        <Check className="w-5 h-5 text-green-500" />
                      )}
                      {transfer.status === 'failed' && (
                        <X className="w-5 h-5 text-red-500" />
                      )}
                      {(transfer.status === 'sending' || transfer.status === 'receiving') && (
                        <Clock className="w-5 h-5 text-blue-500 animate-pulse" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
