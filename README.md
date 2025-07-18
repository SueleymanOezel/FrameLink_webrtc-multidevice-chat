# FrameLink WebRTC Multi-Device Chat

## Project Description

FrameLink is a WebRTC-based video chat application that enables seamless communication between multiple devices. It uses local face detection to automatically switch between devices (e.g., laptop, tablet, smart display) for camera and microphone usage. The switch between devices occurs automatically and without interruption.

**Goal:** Development of a WebRTC-based video chat application with multi-device support and dynamic switching of active devices based on local face detection.

## Features

- Peer-to-Peer Video Chat
- Multi-Device Support
- Automatic Camera Switching based on Face Detection
- Real-time Video Display of Active Device
- Local Face Detection for Data Protection
- WebSocket Signaling

## Setup

### Prerequisites

- Node.js ≥ 16 (for Backend)
- npm or yarn
- Modern web browser with WebRTC support

### Installation

```bash
git clone https://github.com/SueleymanOezel/FrameLink_webrtc-multidevice-chat.git
cd FrameLink_webrtc-multidevice-chat

# Backend
cd Backend
npm install

# Frontend
cd ../frontend
npm install
```

### Configuration

- Configure WebSocket URL and STUN/TURN servers in `frontend/config/index.js`
- Adjust Backend configuration in `Backend/fly.toml` if necessary

### Running the Application

```bash
# Backend
cd Backend
npm start

# Frontend (in a new terminal)
cd ../frontend
npm start
```

## Branch Policy

- `main`: Stable release branch
- `dev`: Integration branch for new features
- Feature Branches: For developing individual features
- Bugfix Branches: For fixing errors

All Pull Requests should be made against the `dev` branch.

## Coding Standards

- Frontend: ESLint, Prettier (configurations in `.eslintrc.js`, `.prettierrc.js`)
- Backend: Standard Node.js coding conventions

Please ensure your code adheres to these standards before creating Pull Requests.
