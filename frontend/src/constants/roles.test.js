import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/roles.js';

describe('roles', () => {
  it('matches the approved application roles', () => {
    expect(Object.values(ROLES).sort()).toEqual([
      'DEPARTMENT_ADMINISTRATOR',
      'LECTURER',
      'STUDENT',
    ]);
  });
});
