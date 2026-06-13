import { useState, type ChangeEvent } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isNativePlatform } from '@/lib/platform';
import {
  applyReminder,
  getReminderSetting,
  setReminderSetting,
  type ReminderSetting,
} from './reminders';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function RemindersSection() {
  const native = isNativePlatform();
  const [setting, setSetting] = useState<ReminderSetting>(() => getReminderSetting());
  const [busy, setBusy] = useState(false);

  const update = async (next: ReminderSetting): Promise<void> => {
    setSetting(next);
    setReminderSetting(next);
    if (!native) return;
    setBusy(true);
    try {
      const res = await applyReminder(next);
      if (res === 'denied') {
        toast.error('Нет разрешения на уведомления — включите его в настройках системы');
      } else if (res === 'scheduled') {
        toast.success(`Напоминание ежедневно в ${pad(next.hour)}:${pad(next.minute)}`);
      } else if (res === 'cancelled') {
        toast.success('Напоминание отключено');
      }
    } catch {
      toast.error('Не удалось настроить напоминание');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = (): void => {
    void update({ ...setting, enabled: !setting.enabled });
  };

  const handleTime = (event: ChangeEvent<HTMLInputElement>): void => {
    const [h, m] = event.target.value.split(':').map((x) => Number(x));
    if (Number.isFinite(h) && Number.isFinite(m)) {
      void update({ ...setting, hour: h, minute: m });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Напоминания</CardTitle>
        <CardDescription>
          Ежедневное напоминание повторить карточки.
          {native ? '' : ' Доступно в установленном приложении.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button
          variant={setting.enabled ? 'default' : 'outline'}
          onClick={handleToggle}
          disabled={busy || !native}
          aria-pressed={setting.enabled}
        >
          <Bell />
          {setting.enabled ? 'Включены' : 'Включить'}
        </Button>
        <Label htmlFor="reminder-time" className="text-sm text-muted-foreground">
          Время
        </Label>
        <Input
          id="reminder-time"
          type="time"
          value={`${pad(setting.hour)}:${pad(setting.minute)}`}
          onChange={handleTime}
          disabled={busy || !native}
          className="w-32"
        />
      </CardContent>
    </Card>
  );
}
