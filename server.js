const socketIo = require('socket.io');
const messageHandler = require('./src/websocket/messageHandler');
const http = require('http');
const app = require('./src/app');

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    }
});

// Initialize socket handlers
messageHandler(io);

// Make io available in request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://192.168.0.102:${PORT}`);
});