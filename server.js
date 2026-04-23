const socketIo = require('socket.io');
const messageHandler = require('./src/websocket/messageHandler');
const http = require('http');
const app = require('./src/app');
const ensureSchema = require('./ensure-schema');
const initializeDeletionJob = require('./src/jobs/deletionJob');
const { initializeBarterMatchmakerJob } = require('./src/jobs/barterMatchmakerJob');


// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

// Initialize socket handlers
messageHandler(io);

// Make io available to all request handlers via req.app.get('io')
app.set('io', io);

const PORT = process.env.PORT || 4000;

// Ensure all required DB tables exist before accepting requests, then start
ensureSchema()
  .then(() => {
    // Start background jobs only after schema is confirmed
    initializeDeletionJob();
    initializeBarterMatchmakerJob();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('FATAL: Schema ensure failed, refusing to start:', err);
    process.exit(1);
  });

// ── Graceful Shutdown ──
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  server.close(async () => {
    console.log('HTTP server closed.');
    
    // Close Database Pool
    try {
      const pool = require('./src/config/database');
      await pool.end();
      console.log('Database pool closed.');
    } catch (err) {
      console.error('Error closing database pool:', err);
    }
    
    // Socket.io will automatically disconnect clients when the server closes
    console.log('Shutdown complete.');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));