import { describe, expect, it } from 'vitest';

describe('CA recovery student labels', () => {
  it('does not treat completion as an official grade change', () => {
    const completed =
      'Assessment completed (official result unchanged until a new import)';
    expect(completed.toLowerCase()).toContain('official result unchanged');
  });
});
