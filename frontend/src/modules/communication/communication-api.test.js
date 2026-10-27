import { describe, expect, it } from 'vitest';
import { communicationApi } from './communication-api.js';

describe('communication deep links', () => {
  it('exposes in-app notification, notice detail, and calendar routes as relative API paths', () => {
    expect(typeof communicationApi.notifications).toBe('function');
    expect(typeof communicationApi.notice).toBe('function');
    expect(typeof communicationApi.events).toBe('function');
  });
});
