import { describe, expect, it } from 'vitest';
import {
  formatEventType,
  formatPublicationState,
  formatWorkflowStatus,
} from './status-labels.js';

describe('status-labels', () => {
  it('maps workflow and publication enums to readable labels', () => {
    expect(formatWorkflowStatus('COMPLETED')).toContain('official result unchanged');
    expect(formatPublicationState('PUBLISHED')).toBe('Published');
    expect(formatEventType('ASSIGNMENT_DEADLINE')).toBe('Assignment deadline');
  });
});
