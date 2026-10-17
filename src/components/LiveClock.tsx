"use client";

import { useEffect, useState } from "react";

const fmt = (d: Date, seconds: boolean) =>
  new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds && { second: "2-digit" }),
    hour12: false,
  }).format(d);

/** Israel time, ticking. Renders nothing until mounted so server and browser never disagree. */
export function LiveClock({ seconds = false, className = "" }: { seconds?: boolean; className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), seconds ? 1000 : 5000);
    return () => clearInterval(id);
  }, [seconds]);
  if (!now) return <span className={className} aria-hidden>&nbsp;</span>;
  return (
    <time dateTime={now.toISOString()} className={`tabular-nums ${className}`} dir="ltr">
      {fmt(now, seconds)}
    </time>
  );
}
