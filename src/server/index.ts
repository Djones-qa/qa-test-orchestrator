import { createApp } from './app.js';
import { createServer } from 'http';
import { config } from '../utils/config.js';
import { WebSocketHandler } from '../websocket/handler.js';
import logger from '../utils/logger.js';

const app = createApp();
const server = createServer(app);

// Initialize WebSocket handler
const wsHandler = new WebSocketHandler(server);

server.listen(config.port, () => {
  logger.info(`QA Test Orchestrator running on port ${config.port}`);
});

export { server, wsHandler };
