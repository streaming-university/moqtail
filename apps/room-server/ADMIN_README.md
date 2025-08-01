# MOQtail Room Management Admin Interface

This document describes the new room management admin interface that allows monitoring and managing active video chat rooms.

## Features

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
- **Responsive Design**: Works on desktop and mobile devices

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
   - API: `http://localhost:3001/api/rooms`

### Proxy Headers

When `MOQTAIL_TRUST_PROXY=true`, the server will:
- Use `X-Forwarded-For` header for real client IP addresses
- Use `X-Real-IP` header as fallback
- Log real IP addresses in admin request logs
- Properly handle CORS with proxy origins

## API Endpoints

All API endpoints require HTTP Basic Authentication using the configured admin password.

### GET `/api/rooms`
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

### POST `/api/rooms/{roomName}/close`
Closes a specific room and disconnects all users.

**Response:**
```json
{
  "success": true,
  "message": "Room room1 closed successfully by administrator"
}
```

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

Both events are followed by the user being disconnected from the room.

## Usage Instructions

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

2. **Access Admin Interface**: 
   - Navigate to `http://localhost:3001/admin` in your web browser
   - Or open `admin.html` directly in your browser

3. **Monitor Rooms**: 
   - The interface automatically loads and displays all active rooms
   - Room cards show comprehensive information including user lists
   - Color-coded time indicators (orange for normal, red for critical time remaining)

4. **Close Rooms**: 
   - Click the "End" button on any room card
   - Confirm the action in the popup dialog
   - The room will be immediately closed and all users disconnected

5. **Refresh Data**: 
   - Data refreshes automatically every 5 seconds
   - Use the "Refresh" button for manual updates

## Configuration

### Auto-refresh Interval
The auto-refresh interval is set to 5 seconds by default. To change this, modify the interval in the JavaScript code:

```javascript
// Change 5000 to desired milliseconds
setInterval(loadRooms, 5000);
```

## Security Considerations

- The admin interface should only be accessible by authorized administrators
- Consider implementing authentication for production environments
- The current implementation allows CORS from any origin for development purposes
- For production, restrict CORS to specific domains

## Troubleshooting

### Admin Page Not Loading
- Ensure the room server is running on the correct port
- Check that the server URL is correct (default: `http://localhost:3001`)
- Verify there are no firewall restrictions

### Rooms Not Displaying
- Check browser console for JavaScript errors
- Verify the `/api/rooms` endpoint is accessible
- Ensure the server is running and responding to HTTP requests

### Close Room Not Working
- Verify the room name contains no special characters that could cause URL encoding issues
- Check browser console for error messages
- Ensure the server has permissions to close rooms and disconnect sockets

## Development Notes

- The admin interface is built with vanilla HTML, CSS, and JavaScript for simplicity
- Styling uses a modern, Apple-inspired design system
- The interface is fully responsive and works on all screen sizes
- All functionality is contained in a single file for easy deployment 
