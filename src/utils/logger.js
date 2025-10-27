import winston from 'winston';

// Configuration des niveaux de log
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Configuration du format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Transports (sorties)
const transports = [
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    handleExceptions: true,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),
  new winston.transports.File({
    filename: 'logs/combined.log',
    handleExceptions: true,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
];

// Transport console en développement
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  );
}

// Création du logger
export const log = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exitOnError: false
});

// Stream pour Morgan (logging HTTP)
export const stream = {
  write: (message) => {
    log.http(message.trim());
  }
};

// Méthodes helper
export const logRequest = (req, res, next) => {
  log.info('Requête entrante', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });
  next();
};

export const logResponse = (req, res, next) => {
  const oldSend = res.send;
  
  res.send = function(data) {
    log.info('Réponse sortante', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      userId: req.user?.id,
      responseTime: `${Date.now() - req.startTime}ms`
    });
    
    res.send = oldSend;
    return res.send(data);
  };
  
  next();
};