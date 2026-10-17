"use client";

import { useEffect, useState } from "react";

/** Registers the service worker (offline copy of pages) and shows a small note while offline. */
export function SwRegister() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-[60] mx-auto w-fit rounded-b-xl bg-ink px-4 py-1.5 text-sm text-bg shadow">
      לא מחובר · מוצגת הגרסה האחרונה שנשמרה
    </div>
  );
}
