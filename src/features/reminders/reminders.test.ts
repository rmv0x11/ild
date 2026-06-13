import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyReminder, getReminderSetting, setReminderSetting } from './reminders';

describe('features/reminders', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('defaults to disabled at 20:00', () => {
    expect(getReminderSetting()).toEqual({ enabled: false, hour: 20, minute: 0 });
  });

  it('round-trips the setting through localStorage', () => {
    setReminderSetting({ enabled: true, hour: 8, minute: 30 });
    expect(getReminderSetting()).toEqual({ enabled: true, hour: 8, minute: 30 });
  });

  it('clamps out-of-range / invalid times on read', () => {
    setReminderSetting({ enabled: true, hour: 99, minute: -5 });
    expect(getReminderSetting()).toEqual({ enabled: true, hour: 23, minute: 0 });
  });

  it('applyReminder is a no-op (unsupported) on the web', async () => {
    await expect(applyReminder({ enabled: true, hour: 9, minute: 0 })).resolves.toBe(
      'unsupported',
    );
  });
});
