import { describe, expect, it } from 'vitest';
import { formatGpaDisplay } from './experience-api.js';

describe('GPA presentation', () => {
  it('does not treat missing calculation as 0.00', () => {
    expect(formatGpaDisplay({ available: false, gpa: null })).toBe(
      'Performance calculation is not yet available.',
    );
    expect(formatGpaDisplay({ available: true, cgpa: 3.21 })).toBe('CGPA 3.21');
  });
});
