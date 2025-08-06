# MOQtail Room Management Admin Interface

This document describes the comprehensive room management admin interface that provides monitoring, management, and control capabilities for MOQtail backend services.

## Features Overview

The admin interface now includes a modern tabbed design with three main sections:

### 🏠 Active Rooms Tab
- **Real-time Room Monitoring**: View all active rooms with detailed information
- **Room Information Display**: 
  - Room name and ID
  - Number of users
  - Creation date and time
  - Time remaining until automatic timeout
  - Current duration
- **User Details**: See all users in each room with their media status (video, audio, screenshare)
- **Manual Room Closure**: End rooms manually with confirmation
- **Auto-refresh**: Interface updates every 5 seconds automatically

### ⚙️ Service Status Tab
- **Real-time Service Monitoring**: Monitor all PM2-managed backend services
- **Service Information Display**:
  - Service ID, name, and status (online/offline/stopping)
  - CPU usage percentage
  - Memory consumption (formatted as kb/mb)
  - Uptime duration (days/hours/minutes)
  - Restart count and process ID
- **Service Control Buttons**:
  - Restart Relay (individual relay service restart)
  - Restart Room Server (individual room server restart)
  - Restart Backend Services (restart all services sequentially)
- **Color-coded Status Indicators**: Green (online), red (offline), orange (stopping)

### 📋 Logs Tab
- **Service Log Viewing**: View logs from relay and room server services
- **Service Selection**: Toggle between Relay logs and Room Server logs
- **Configurable Line Count**: Adjustable from 10 to 1000 lines (default: 100)
- **Terminal-style Display**: Dark theme with monospace font
- **Auto-scroll**: Automatically scrolls to latest log entries
- **Real-time Updates**: Auto-refresh every 5 seconds when active

### 🎨 UI/UX Features
- **Responsive Design**: Works on desktop and mobile devices
- **Modern Tabbed Interface**: Clean organization of different admin functions
- **Smart Auto-refresh**: Only refreshes the currently active tab for better performance
- **Apple-inspired Design**: Modern, clean aesthetic with smooth transitions

## Access

### Password Protection

The admin interface is password-protected using HTTP Basic Authentication. You can set the admin password using either method:

**Method 1: Environment Variable (recommended for production)**
```bash
export MOQTAIL_ADMIN_PASSWORD="your-secure-password"
```

**Method 2: .env File (recommended for development)**
1. Copy the example environment file:
   ```bash
   cp env.example .env
   ```

2. Edit the `.env` file and configure your settings:
   ```bash
   # .env file
   MOQTAIL_ADMIN_PASSWORD=your-secure-password
   
   # Optional: If running behind a proxy (nginx, etc.)
   MOQTAIL_BEHIND_PROXY=false
   MOQTAIL_TRUST_PROXY=false
   MOQTAIL_WS_PORT=3001
   ```

3. Install dotenv (if not already installed):
   ```bash
   npm install dotenv
   ```

4. Start the server with:
   ```bash
   # Using npm script (recommended)
   npm run start:env
   # or for development with auto-restart
   npm run dev:env
   
   # Or manually
   node -r dotenv/config dist/server.js
   ```

**Security Note**: 
- Use a strong password and never commit it to version control
- Add `.env` to your `.gitignore` file
- Use secure environment variable management in production

**Important**: If `MOQTAIL_ADMIN_PASSWORD` is not set, the admin interface and API endpoints will be completely disabled for security.

### Accessing the Interface

Access the admin interface directly through the room server:

```
http://localhost:3001/admin
```

When prompted, enter:
- **Username**: Any username (ignored)
- **Password**: The password you set in `MOQTAIL_ADMIN_PASSWORD`

The admin page is served directly from the room server and all admin endpoints are protected by the same authentication.

## API Endpoints

All API endpoints require HTTP Basic Authentication using the configured admin password.

### Room Management Endpoints

#### GET `/api/rooms`
Returns a list of all active rooms with their details.

**Response:**
```json
[
  {
    "name": "room1",
    "id": 0,
    "userCount": 2,
    "created": 1640995200000,
    "timeLeft": 540000,
    "users": [
      {
        "id": "socket-id",
        "name": "username",
        "joined": 1640995200000,
        "hasVideo": true,
        "hasAudio": true,
        "hasScreenshare": false
      }
    ]
  }
]
```

#### POST `/api/rooms/{roomName}/close`
Closes a specific room and disconnects all users.

**Response:**
```json
{
  "success": true,
  "message": "Room room1 closed successfully by administrator"
}
```

### Backend Management Endpoints

#### POST `/api/backend/restart-relay`
Restarts the relay service. Closes all active rooms first to warn users.

**Response:**
```json
{
  "success": true,
  "message": "All rooms closed and relay restarted successfully",
  "output": "PM2 restart output..."
}
```

#### POST `/api/backend/restart-room-server`
Restarts the room server. Closes all active rooms first and terminates the current process.

**Response:**
```json
{
  "success": true,
  "message": "Server restart initiated. The server will restart automatically."
}
```

#### POST `/api/backend/restart-all`
Restarts all backend services sequentially. Closes rooms, restarts relay, then restarts room server.

**Response:**
```json
{
  "success": true,
  "message": "All rooms closed, relay restarted, server restarting..."
}
```

#### GET `/api/backend/service-status`
Returns the status of all PM2-managed services.

**Response:**
```json
{
  "success": true,
  "services": [
    {
      "id": 0,
      "name": "relay",
      "status": "online",
      "cpu": "0%",
      "memory": "19.3mb",
      "uptime": "3m",
      "restarts": 191,
      "pid": "2018067"
    }
  ]
}
```

#### GET `/api/backend/logs?service={service}&lines={count}`
Returns logs for the specified service.

**Parameters:**
- `service`: Either "relay" or "ws" (room server)
- `lines`: Number of lines to retrieve (10-1000, default: 100)

**Response:**
```json
{
  "success": true,
  "service": "relay",
  "lines": 100,
  "logs": "Log content here..."
}
```

## Proxy Configuration

The room server can run both standalone and behind a reverse proxy (nginx, Apache, etc.). 

### Running Behind a Proxy

If you're running the room server behind a reverse proxy:

1. **Configure environment variables:**
   ```bash
   MOQTAIL_BEHIND_PROXY=true
   MOQTAIL_TRUST_PROXY=true  # Enable if you want real IP logging
   MOQTAIL_WS_PORT=9445      # Or your preferred port
   ```

2. **Configure your proxy server** to forward these paths:
   - `/ws/` → WebSocket connections (Socket.IO)
   - `/admin` → Admin interface
   - `/api/rooms*` → Room management API
   - `/api/backend*` → Backend management API

3. **Use the provided nginx configuration example:**
   ```bash
   cp nginx.conf.example /etc/nginx/sites-available/moqtail-room-server
   # Edit the file to match your setup
   sudo ln -s /etc/nginx/sites-available/moqtail-room-server /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

### Standalone Mode

For standalone operation (development or simple deployments):

1. **Set environment variables:**
   ```bash
   MOQTAIL_BEHIND_PROXY=false
   MOQTAIL_WS_PORT=3001
   ```

2. **Access directly:**
   - Admin interface: `http://localhost:3001/admin`
   - Room API: `http://localhost:3001/api/rooms`
   - Backend API: `http://localhost:3001/api/backend/service-status`

### Proxy Headers

When `MOQTAIL_TRUST_PROXY=true`, the server will:
- Use `X-Forwarded-For` header for real client IP addresses
- Use `X-Real-IP` header as fallback
- Log real IP addresses in admin request logs
- Properly handle CORS with proxy origins

## WebSocket Events

When rooms are closed, users receive different events depending on the closure reason:

### Automatic Timeout Closure
```javascript
socket.on('room-timeout', (data) => {
  // data.message: "Room room1 has timed out and will be closed."
});
```

### Admin Manual Closure
```javascript
socket.on('room-closed', (data) => {
  // data.message: "Room room1 has been closed by an administrator."
  // data.reason: "admin"
});
```

### Service Restart Closure
```javascript
socket.on('room-closed', (data) => {
  // data.reason: "admin" (for all admin-initiated closures)
  // Users are warned before service restarts
});
```

All events are followed by the user being disconnected from the room.

## Usage Instructions

### Setup and Start

1. **Set up the admin password** (choose one method):
   - **Environment variable**: `export MOQTAIL_ADMIN_PASSWORD="your-password"`
   - **.env file**: Copy `env.example` to `.env` and set the password

2. **Start the Room Server**: 
   ```bash
   cd apps/room-server
   
   # With environment variable
   npm run start
   # or for development
   npm run dev
   
   # With .env file
   npm run start:env
   # or for development with auto-restart
   npm run dev:env
   ```

3. **Access Admin Interface**: 
   - Navigate to `http://localhost:3001/admin` in your web browser
   - Enter your admin credentials when prompted

### Using the Interface

#### Active Rooms Tab
1. **Monitor Rooms**: 
   - Default active tab showing all current rooms
   - Color-coded time indicators (orange for normal, red for critical time remaining)
   - Real-time user status indicators

2. **Close Rooms**: 
   - Click the "End" button on any room card
   - Confirm the action in the popup dialog
   - Room is immediately closed and all users disconnected

3. **Refresh Data**: 
   - Use the "Refresh" button for manual updates
   - Auto-refreshes every 5 seconds

#### Service Status Tab
1. **Monitor Services**:
   - View real-time status of relay and room server services
   - Monitor CPU, memory usage, and uptime
   - Track restart counts and process information

2. **Restart Services**:
   - **Restart Relay**: Closes rooms, then restarts relay service
   - **Restart Room Server**: Closes rooms, then restarts room server
   - **Restart Backend Services**: Sequential restart of all services
   - All restart actions show confirmation dialogs

3. **Refresh Services**:
   - Use "Refresh Services" button for manual updates
   - Auto-refreshes every 5 seconds when tab is active

#### Logs Tab
1. **Select Service**:
   - Click "Relay Logs" or "Room Server Logs" buttons
   - Active service button is highlighted in blue

2. **Configure Log Display**:
   - Adjust line count (10-1000 lines)
   - Default is 100 lines

3. **View Logs**:
   - Logs display in terminal-style dark container
   - Auto-scrolls to show latest entries
   - Use "Refresh Logs" for manual updates
   - Auto-refreshes every 5 seconds when tab is active

## PM2 Integration

The admin interface integrates with PM2 for service management:

### Required PM2 Services
- **relay**: The MOQtail relay service
- **ws**: The room server service

### PM2 Commands Used
- `pm2 jlist`: Get service status (JSON format)
- `pm2 restart <service>`: Restart specific service
- `pm2 logs --nostream --raw --lines N <service>`: Get service logs

### Setup PM2 Services
Ensure your services are properly configured in PM2:
```bash
# Example PM2 ecosystem file
module.exports = {
  apps: [
    {
      name: 'relay',
      script: './relay-executable',
      // ... other config
    },
    {
      name: 'ws',
      script: './room-server',
      // ... other config
    }
  ]
};
```

## Security Considerations

- **Authentication Required**: All admin endpoints require HTTP Basic Authentication
- **Input Validation**: Service names and parameters are validated to prevent injection
- **Command Restrictions**: Only specific PM2 commands are allowed
- **Buffer Limits**: Log retrieval has memory limits (5MB) to prevent abuse
- **CORS Configuration**: Configure appropriately for your deployment environment

## Troubleshooting

### Admin Page Not Loading
- Ensure the room server is running on the correct port
- Check that the server URL is correct (default: `http://localhost:3001`)
- Verify admin password is set correctly
- Check browser console for authentication errors

### Services Not Displaying
- Verify PM2 is installed and services are running
- Check that service names match expected values ("relay", "ws")
- Ensure PM2 is accessible from the room server process
- Check server logs for PM2 command errors

### Logs Not Loading
- Verify PM2 services exist and are named correctly
- Check PM2 log file permissions
- Ensure adequate disk space for log operations
- Verify line count parameter is within valid range (10-1000)

### Restart Operations Failing
- Check PM2 service permissions
- Verify services are properly configured in PM2
- Ensure adequate system resources for restarts
- Check server logs for detailed error messages

## Development Notes

- **Technology Stack**: Vanilla HTML, CSS, and JavaScript for simplicity
- **Design System**: Modern, Apple-inspired design with smooth transitions
- **Responsive Layout**: Works on all screen sizes and devices
- **Single File Deployment**: All functionality contained for easy deployment
- **Tab-based Architecture**: Organized functionality with smart auto-refresh
- **Real-time Updates**: Efficient polling only for active tabs
