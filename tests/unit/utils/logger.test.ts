import { logger, Logger, LogLevel } from '../../../src/utils/logger.js';

describe('Logger', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('log levels', () => {
    it('should support info level', () => {
      const log = new Logger('info');
      log.info('test message');

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(stdoutSpy.mock.calls[0][0].replace('\n', ''));
      expect(output.level).toBe('info');
      expect(output.message).toBe('test message');
      expect(output.timestamp).toBeDefined();
    });

    it('should support warn level', () => {
      const log = new Logger('debug');
      log.warn('warning message');

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(stderrSpy.mock.calls[0][0].replace('\n', ''));
      expect(output.level).toBe('warn');
      expect(output.message).toBe('warning message');
    });

    it('should support error level', () => {
      const log = new Logger('debug');
      log.error('error message');

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(stderrSpy.mock.calls[0][0].replace('\n', ''));
      expect(output.level).toBe('error');
      expect(output.message).toBe('error message');
    });

    it('should support debug level', () => {
      const log = new Logger('debug');
      log.debug('debug message');

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(stdoutSpy.mock.calls[0][0].replace('\n', ''));
      expect(output.level).toBe('debug');
      expect(output.message).toBe('debug message');
    });
  });

  describe('log level filtering', () => {
    it('should not output debug messages when level is info', () => {
      const log = new Logger('info');
      log.debug('should not appear');

      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should not output info messages when level is warn', () => {
      const log = new Logger('warn');
      log.info('should not appear');

      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should not output warn messages when level is error', () => {
      const log = new Logger('error');
      log.warn('should not appear');

      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should output error messages at any level', () => {
      const log = new Logger('error');
      log.error('always visible');

      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('structured output', () => {
    it('should include metadata in log output', () => {
      const log = new Logger('info');
      log.info('request received', { method: 'GET', path: '/api/v1/suites', statusCode: 200 });

      const output = JSON.parse(stdoutSpy.mock.calls[0][0].replace('\n', ''));
      expect(output.level).toBe('info');
      expect(output.message).toBe('request received');
      expect(output.method).toBe('GET');
      expect(output.path).toBe('/api/v1/suites');
      expect(output.statusCode).toBe(200);
    });

    it('should include ISO 8601 timestamp', () => {
      const log = new Logger('info');
      log.info('test');

      const output = JSON.parse(stdoutSpy.mock.calls[0][0].replace('\n', ''));
      expect(() => new Date(output.timestamp)).not.toThrow();
      expect(output.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should produce valid JSON output', () => {
      const log = new Logger('debug');
      log.debug('json test', { nested: { key: 'value' } });

      const raw = stdoutSpy.mock.calls[0][0].replace('\n', '');
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  describe('setLevel and getLevel', () => {
    it('should allow changing log level at runtime', () => {
      const log = new Logger('info');
      expect(log.getLevel()).toBe('info');

      log.setLevel('debug');
      expect(log.getLevel()).toBe('debug');

      log.debug('now visible');
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('singleton export', () => {
    it('should export a default logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.getLevel).toBeDefined();
    });
  });
});
