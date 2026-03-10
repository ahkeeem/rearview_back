const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const getLogFileName = (level) => {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `${level}-${date}.log`);
};

const shouldLog = (level) => {
  return LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL];
};

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
};

const writeLog = (level, message, meta = {}) => {
  if (!shouldLog(level)) return;

  const logMessage = formatMessage(level, message, meta);
  
  // Console output
  const colors = {
    error: '\x1b[31m', // Red
    warn: '\x1b[33m',  // Yellow
    info: '\x1b[36m',  // Cyan
    debug: '\x1b[90m'  // Gray
  };
  const reset = '\x1b[0m';
  console.log(`${colors[level] || ''}${logMessage.trim()}${reset}`);

  // File output for errors and warnings
  if (level === 'error' || level === 'warn') {
    const logFile = getLogFileName(level);
    fs.appendFileSync(logFile, logMessage, 'utf8');
  }
};

const logger = {
  error: (message, meta) => writeLog('error', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  info: (message, meta) => writeLog('info', message, meta),
  debug: (message, meta) => writeLog('debug', message, meta),
  
  // Request logger middleware
  requestLogger: (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      };
      
      if (res.statusCode >= 400) {
        logger.error('Request failed', logData);
      } else {
        logger.info('Request completed', logData);
      }
    });
    
    next();
  }
};

module.exports = logger;

