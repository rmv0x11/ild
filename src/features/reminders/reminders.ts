// Daily "time to review" local notification. No backend, no background task —
// just a repeating on-device notification at a user-chosen time, scheduled via
// @capacitor/local-notifications (loaded lazily, native only). The setting is
// persisted in localStorage so the UI can reflect it and re-apply on launch.

import { isNativePlatform } from '@/lib/platform';

export interface ReminderSetting {
  enabled: boolean;
  hour: number;
  minute: number;
}

export type ApplyResult = 'scheduled' | 'cancelled' | 'denied' | 'unsupported';

const KEY = 'ild:reminder';
const REMINDER_ID = 1001;
const DEFAULT: ReminderSetting = { enabled: false, hour: 20, minute: 0 };

function clampHour(n: number): number {
  return Number.isFinite(n) ? Math.min(23, Math.max(0, Math.trunc(n))) : DEFAULT.hour;
}

function clampMinute(n: number): number {
  return Number.isFinite(n) ? Math.min(59, Math.max(0, Math.trunc(n))) : DEFAULT.minute;
}

export function getReminderSetting(): ReminderSetting {
  if (typeof window === 'undefined') return { ...DEFAULT };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<ReminderSetting>;
    return {
      enabled: !!parsed.enabled,
      hour: clampHour(Number(parsed.hour)),
      minute: clampMinute(Number(parsed.minute)),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function setReminderSetting(setting: ReminderSetting): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(setting));
  } catch {
    /* ignored */
  }
}

/**
 * Apply the setting to the device: schedule a daily repeating notification, or
 * cancel it. No-op ('unsupported') on the web — local notifications only work
 * inside the native app.
 */
export async function applyReminder(setting: ReminderSetting): Promise<ApplyResult> {
  if (!isNativePlatform()) return 'unsupported';

  const { LocalNotifications } = await import('@capacitor/local-notifications');

  // Clear any existing schedule first so re-applying can't duplicate it.
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });

  if (!setting.enabled) return 'cancelled';

  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return 'denied';

  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: 'ild',
        body: 'Пора повторить китайские карточки',
        schedule: {
          on: { hour: clampHour(setting.hour), minute: clampMinute(setting.minute) },
          allowWhileIdle: true,
        },
      },
    ],
  });
  return 'scheduled';
}
