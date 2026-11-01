import { useEffect, useState } from 'react';

function localYMD(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Today's local date (YYYY-MM-DD) that re-renders the caller once at each
 * local midnight. Views that derive "today" only on render otherwise freeze on
 * the day the app was opened when it stays open overnight.
 */
export function useLocalDay(): string {
  const [day, setDay] = useState(localYMD);
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const id = setTimeout(() => setDay(localYMD()), nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(id);
  }, [day]);
  return day;
}
