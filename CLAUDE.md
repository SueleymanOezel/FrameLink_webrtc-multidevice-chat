# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FrameLink is a WebRTC-based video calling application with multi-device support and automatic camera switching based on local face detection. The system enables seamless video communication between users across different rooms with various devices, automatically selecting the active device using face detection technology.

## Project Structure

The repository follows a dual-architecture pattern:

- **Server_Glitch/**: Node.js WebSocket signaling server optimized for Fly.io deployment
- **frontend/**: Static web application with sophisticated multi-device video management

## Core Architecture

### Server Component (Server_Glitch/)
- **server.js**: WebSocket signaling server with room management and multi-device coordination
- Uses `ws` library for WebSocket connections
- Handles both local room management (multi-device) and external video calls
- Includes health checks, heartbeat system, and graceful shutdown for cloud deployment

### Frontend Components (frontend/)
The frontend uses a modular architecture with several interconnected JavaScript files:

#### Core System (app.js)
- **FrameLink Global System**: Centralized state management with event-driven architecture
- **PeerConnectionFactory**: Standardized WebRTC peer connection creation with TURN server configuration
- **WebSocketManager**: Enhanced connection handling with automatic reconnection
- **MediaManager**: Local media stream management (camera/microphone controls)
- **CallManager**: WebRTC call lifecycle management

#### Multi-Device System (simple-room.js)
- **RoomManager**: Room creation, URL handling, and device management
- **DeviceManager**: Multi-device coordination and status tracking
- **RoomVideoManager**: Video stream distribution across devices in local rooms
- Integrates face detection for automatic device switching

#### Auto-Switching System (auto-camera-switching.js)
- **Face Detection Engine**: Automatic camera switching based on face presence
- **Decision Logic**: Hysteresis, confidence thresholds, and switch rate limiting
- **Manual Override System**: Temporary disabling of auto-switching

#### UI Layer (index.html)
- **Responsive Design**: Adapts between single-device and multi-device layouts
- **Room Video Grid**: Dynamic device display with status indicators
- **External Call Section**: Dedicated area for remote participant video
- **Status Management**: Real-time feedback and device state visualization

## Development Commands

### Server (Server_Glitch/)
```bash
cd Server_Glitch
npm install
npm start  # Starts WebSocket server on port 3000 (or PORT env var)
```

### Frontend (frontend/)
```bash
cd frontend
npm install
npm start     # Starts live-server on port 3000
npm run lint  # ESLint code checking
npm run format # Prettier code formatting
```

## Key Technical Concepts

### WebRTC Configuration
The system uses a comprehensive TURN server configuration in `app.js`:
- Multiple STUN servers for NAT traversal
- Metered.ca TURN servers with UDP/TCP fallbacks
- ICE candidate pooling and connection monitoring

### Multi-Device Architecture
1. **Local Rooms**: Devices in the same physical location join a room for coordination
2. **External Calls**: WebRTC connections to remote participants
3. **Camera Control**: Only one device per room actively uses camera/microphone
4. **Face Detection**: Local browser-based face detection for automatic switching

### Event System
The application uses a global event system (`frameLink.events`) for inter-module communication:
- `websocket-ready`: WebSocket connection established
- `local-stream-ready`: Local media stream available
- `remote-stream`: Remote participant video received
- `call-started`/`call-ended`: Call lifecycle events
- `camera-toggled`/`microphone-toggled`: Media control events

### State Management
Central state is managed through `frameLink.core` and `roomState` objects:
- Connection status, media streams, current calls
- Room membership, device relationships
- Face detection states and switching decisions

## Configuration

### WebSocket URL
Set in `index.html`: `window.WEBSOCKET_URL = "wss://framelink-signaling.fly.dev"`

### TURN Server Credentials
Configured in `app.js` with credentials for metered.ca TURN servers

### Face Detection Settings
Auto-switching parameters in `auto-camera-switching.js`:
- Detection thresholds, hysteresis delays
- Switch rate limiting, confidence bonuses

## Development Workflow

1. **Local Development**: Use `npm start` in both server and frontend directories
2. **Testing Multi-Device**: Open multiple browser tabs/windows with same room URL
3. **Face Detection Testing**: Enable camera in multiple devices to test automatic switching
4. **External Calls**: Use different room URLs or disable multi-device mode

## Debugging

### Browser Console
- `frameLink.log()`: Core system logging
- `frameLinkDebug.status()`: Current system state
- `window.roomVideoManager`: Room video management functions

### Server Logs
- Connection/disconnection events
- Room management operations
- WebRTC signaling message flow

## Important Notes

- The system prioritizes privacy with local-only face detection
- WebSocket connections include heartbeat/ping-pong for stability
- UI automatically adapts between single and multi-device modes
- Manual camera control temporarily overrides automatic switching
- All peer connections use the same TURN configuration for consistency

## Branch Strategy

- `main`: Stable release branch
- `dev`: Integration branch for new features (current working branch)
- Feature branches: Individual feature development
- All PRs target `dev` branch

## Code Quality

- ESLint configuration for JavaScript standards
- Prettier for consistent code formatting
- German comments in README but English code comments
- Comprehensive logging system for debugging