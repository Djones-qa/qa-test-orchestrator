import {
  successResponse,
  errorResponse,
  ApiResponse,
  PaginationMeta,
  FieldError,
} from '../../../src/utils/types';

describe('Response Envelope Helpers', () => {
  describe('successResponse', () => {
    it('should create a success response with data', () => {
      const data = { id: '1', name: 'Test Suite' };
      const response = successResponse(data);

      expect(response.status).toBe('success');
      expect(response.data).toEqual(data);
      expect(response.error).toBeNull();
      expect(response.meta).toBeUndefined();
    });

    it('should include pagination meta when provided', () => {
      const data = [{ id: '1' }, { id: '2' }];
      const meta: PaginationMeta = {
        totalCount: 50,
        pageSize: 20,
        nextCursor: 'cursor-abc',
      };
      const response = successResponse(data, meta);

      expect(response.status).toBe('success');
      expect(response.data).toEqual(data);
      expect(response.error).toBeNull();
      expect(response.meta).toEqual(meta);
    });

    it('should handle null data', () => {
      const response = successResponse(null);

      expect(response.status).toBe('success');
      expect(response.data).toBeNull();
      expect(response.error).toBeNull();
    });
  });

  describe('errorResponse', () => {
    it('should create an error response with message and code', () => {
      const response = errorResponse('Not found', 'NOT_FOUND');

      expect(response.status).toBe('error');
      expect(response.data).toBeNull();
      expect(response.error).toEqual({
        message: 'Not found',
        code: 'NOT_FOUND',
      });
    });

    it('should include field errors when provided', () => {
      const fields: FieldError[] = [
        { field: 'name', message: 'Name is required', constraint: 'required' },
        { field: 'framework', message: 'Invalid framework', constraint: 'enum' },
      ];
      const response = errorResponse('Validation failed', 'VALIDATION_ERROR', fields);

      expect(response.status).toBe('error');
      expect(response.data).toBeNull();
      expect(response.error).toEqual({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        fields,
      });
    });

    it('should not include fields property when not provided', () => {
      const response = errorResponse('Server error', 'INTERNAL_ERROR');

      expect(response.error).not.toHaveProperty('fields');
    });
  });

  describe('Type structure compliance', () => {
    it('success response matches ApiResponse interface', () => {
      const response: ApiResponse<string> = successResponse('hello');

      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('error');
    });

    it('error response matches ApiResponse interface', () => {
      const response: ApiResponse<never> = errorResponse('err', 'CODE');

      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('error');
    });
  });
});
