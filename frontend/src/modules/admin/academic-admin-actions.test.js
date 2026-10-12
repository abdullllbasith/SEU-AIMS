import { describe, expect, it } from 'vitest';

function confirmRestore(label) {
  return `Restore this ${label} to ACTIVE?`;
}

function confirmDelete(label) {
  return `Permanently delete this archived ${label}?`;
}

describe('academic admin action copy', () => {
  it('documents restore and delete confirmation intent', () => {
    expect(confirmRestore('semester')).toContain('ACTIVE');
    expect(confirmDelete('academic year')).toContain('archived');
  });
});
