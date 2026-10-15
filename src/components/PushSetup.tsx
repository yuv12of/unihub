"use client";

import { useEffect, useState, useTransition } from "react";
import { ensurePushKey, removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions";

function urlB64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "denied";

export function PushSetup() {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
        return setState(ios && !standalone ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      setMsg(null);
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return setState("denied");
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const key = await ensurePushKey();
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
        const json = sub.toJSON();
        await savePushSubscription({ endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth });
        setState("on");
      } catch {
        setMsg("ההפעלה לא הצליחה. נסו שוב.");
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });

  const test = () =>
    start(async () => {
      try {
        const n = await sendTestPush();
        setMsg(n ? "נשלחה התראת ניסיון." : "לא נמצא מכשיר רשום.");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "השליחה נכשלה.");
      }
    });

  const btn = "rounded-lg border border-rule px-4 py-2 text-sm hover:border-ink disabled:opacity-50";
  return (
    <div className="mt-4 space-y-3 text-sm">
      {state === "loading" && <p className="text-ink-soft">בודק…</p>}
      {state === "needs-install" && (
        <p className="leading-relaxed">
          באייפון ובאייפד התראות עובדות רק מהאפליקציה המותקנת: בספארי לחצו <b>שיתוף</b> ← <b>הוספה למסך הבית</b>, פתחו את
          Unihub מהאייקון, וחזרו לכאן.
        </p>
      )}
      {state === "unsupported" && <p className="text-ink-soft">הדפדפן הזה לא תומך בהתראות.</p>}
      {state === "denied" && (
        <p className="text-ink-soft">ההתראות חסומות בדפדפן. אפשר לאשר אותן בהגדרות האתר של הדפדפן ולנסות שוב.</p>
      )}
      {state === "off" && (
        <button type="button" onClick={enable} disabled={pending} className="rounded-lg bg-ink px-4 py-2 font-medium text-bg disabled:opacity-60">
          הפעלת התראות במכשיר הזה
        </button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <span className="self-center">✓ ההתראות פעילות במכשיר הזה.</span>
          <button type="button" onClick={test} disabled={pending} className={btn}>
            שליחת התראת ניסיון
          </button>
          <button type="button" onClick={disable} disabled={pending} className={btn}>
            כיבוי
          </button>
        </div>
      )}
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
