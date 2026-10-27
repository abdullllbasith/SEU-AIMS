import { describe, expect, it } from 'vitest';
import { studentsCsvUrl } from './admin-api.js';

describe('admin-api', () => {
  it('keeps the student CSV on an authenticated admin path', () => {
    expect(studentsCsvUrl()).toBe('/api/admin/exports/students.csv');
  });
});
