# Clawfly - 跨平台局域网通讯软件

## 功能特性

- ✅ 局域网用户自动发现（兼容 OpenClaw 协议）
- ✅ 即时消息收发
- ✅ 文件高速传输（支持断点续传）
- ✅ 系统托盘
- ✅ 桌面通知
- ✅ 拖拽发送文件
- ✅ 现代化 UI 设计

## 技术栈

- **前端**：React 18 + TypeScript + Vite + TailwindCSS
- **后端**：Electron + Node.js
- **协议**：UDP 广播（端口 2425）+ TCP 消息/文件传输（端口 2426/2427）

## 快速开始

### 1. 安装依赖

```bash
# 安装 pnpm（如果没有）
npm install -g pnpm

# 安装项目依赖
pnpm install
```

### 2. 开发模式

```bash
# 启动开发服务器
pnpm run dev:electron
```

### 3. 构建生产版本

```bash
# 构建 Electron 应用
pnpm run build:electron

# 或者只构建前端
pnpm run build
```

构建完成后，在 `release/` 目录下会生成：
- **Windows**: `Clawfly-Setup.exe`
- **macOS**: `Clawfly.dmg`
- **Linux**: `Clawfly.AppImage` 或 `clawfly_1.0.0_amd64.deb`

## 使用说明

1. 启动应用后，软件会自动搜索局域网内的其他 Clawfly/OpenClaw 用户
2. 在左侧用户列表中点击选择一个用户
3. 在聊天窗口中发送文本消息
4. 点击附件按钮或拖拽文件到窗口发送文件
5. 文件传输进度会在右侧面板显示

## 端口说明

- **2425/UDP**: 用户发现广播
- **2426/TCP**: 消息传输
- **2427/TCP**: 文件传输

## GitHub Actions 自动构建

项目已配置 GitHub Actions，可以自动构建所有平台版本。

### 触发构建

1. 将代码推送到 GitHub
2. 进入 Actions 页面查看构建进度
3. 下载对应平台的构建产物

### 国内镜像配置

如果 GitHub Actions 构建失败（网络问题），可以在 workflow 中配置国内镜像：

```yaml
env:
  ELECTRON_MIRROR: https://npmmirror.com/mirrors/electron/
```

## 兼容性

- 与 OpenClaw、飞鸽传书、飞秋协议兼容
- 支持 Windows、macOS、Ubuntu/Linux

## 许可证

MIT License
