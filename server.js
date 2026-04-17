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
      origin: (origin, callback) => {
        const allowedOrigins = [process.env.CORS_ORIGIN, "http://localhost:3000", "https://rearview-front.vercel.app"].filter(Boolean);
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling']
});

// Initialize socket handlers
messageHandler(io);

// Make io available in request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

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