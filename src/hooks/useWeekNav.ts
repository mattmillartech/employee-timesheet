import { useCallback, useMemo, useState } from 'react';
import { addDays, nowInTimezone, sundayOf, toISODate } from '@/lib/dateUtils';

export type WeekNav = {
  sunday: Date;
  weekDaysISO: string[];
  selectedDate: string;
  setSelectedDate: (iso: string) => void;
  gotoPrevWeek: () => void;
  gotoNextWeek: () => void;
  gotoThisWeek: () => void;
};

export function useWeekNav(timezone: string, initialISO?: string): WeekNav {
  const todayDate = useMemo(() => nowInTimezone(timezone), [timezone]);

  const [anchor, setAnchor] = useState<Date>(
    initialISO ? (() => {
      const parts = initialISO.split('-').map(Number);
      return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
    })() : todayDate,
  );

  const sunday = useMemo(() => sundayOf(anchor), [anchor]);

  const weekDaysISO = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toISODate(addDays(sunday, i))),
    [sunday],
  );

  const [selectedDate, setSelectedDate] = useState<string>(
    initialISO && weekDaysISO.includes(initialISO) ? initialISO : toISODate(sunday),
  );

  const gotoPrevWeek = useCallback((): void => {
    setAnchor((prev) => addDays(prev, -7));
    setSelectedDate((prev) => {
      const parts = prev.split('-').map(Number);
      const d = new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
      return toISODate(addDays(d, -7));
    });
  }, []);

  const gotoNextWeek = useCallback((): void => {
    setAnchor((prev) => addDays(prev, 7));
    setSelectedDate((prev) => {
      const parts = prev.split('-').map(Number);
      const d = new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
      return toISODate(addDays(d, 7));
    });
  }, []);

  const gotoThisWeek = useCallback((): void => {
    setAnchor(todayDate);
    setSelectedDate(toISODate(todayDate));
  }, [todayDate]);

  return {
    sunday,
    weekDaysISO,
    selectedDate,
    setSelectedDate,
    gotoPrevWeek,
    gotoNextWeek,
    gotoThisWeek,
  };
}
