import logger, { LogEntry } from '../../../src/utils/logger';

describe('Logger utility', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('log entry structure', () => {
    it('should emit a JSON object with level, message, and timestamp for info', () => {
      logger.info('hello world');
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const raw: string = consoleSpy.log.mock.calls[0][0] as string;
      const entry: LogEntry = JSON.parse(raw);
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('hello world');
      expect(typeof entry.timestamp).toBe('string');
      expect(new Date(entry.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('should include meta when provided', () => {
      logger.info('with meta', { requestId: 'abc', code: 42 });
      const raw: string = consoleSpy.log.mock.calls[0][0] as string;
      const entry: LogEntry = JSON.parse(raw);
      expect(entry.meta).toEqual({ requestId: 'abc', code: 42 });
    });

    it('should omit meta key when no meta is provided', () => {
      logger.info('no meta');
      const raw: string = consoleSpy.log.mock.calls[0][0] as string;
      const entry: LogEntry = JSON.parse(raw);
      expect(Object.prototype.hasOwnProperty.call(entry, 'meta')).toBe(false);
    });
  });

  describe('log level routing', () => {
    it('info should call console.log', () => {
      logger.info('info msg');
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('warn should call console.warn', () => {
      logger.warn('warn msg');
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('error should call console.error', () => {
      logger.error('error msg');
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('debug should call console.log in non-production', () => {
      const prev = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'test';
      // Re-require the module to pick up the env change
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { default: freshLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
      freshLogger.debug('debug msg');
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      process.env['NODE_ENV'] = prev;
    });
  });

  describe('production mode suppresses debug', () => {
    it('should not emit debug logs when NODE_ENV=production', () => {
      process.env['NODE_ENV'] = 'production';
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { default: prodLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
      prodLogger.debug('should be suppressed');
      expect(consoleSpy.log).not.toHaveBeenCalled();
      process.env['NODE_ENV'] = 'test';
    });

    it('should still emit info/warn/error in production', () => {
      process.env['NODE_ENV'] = 'production';
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { default: prodLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
      prodLogger.info('info in prod');
      prodLogger.warn('warn in prod');
      prodLogger.error('error in prod');
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      process.env['NODE_ENV'] = 'test';
    });
  });

  describe('timestamp validity', () => {
    it('timestamp should be a valid ISO 8601 string', () => {
      logger.warn('timestamp check');
      const raw: string = consoleSpy.warn.mock.calls[0][0] as string;
      const entry: LogEntry = JSON.parse(raw);
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
