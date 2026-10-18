"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

/** "Done today" card as an image, for WhatsApp status or a story. Drawn in the browser; nothing is uploaded. */
export function ShareDay({ name, date, minutes, sessions, routines, streak }: { name: string; date: string; minutes: number; sessions: number; routines: number; streak: number }) {
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const W = 1080;
      const H = 1350;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d")!;
      const css = getComputedStyle(document.documentElement);
      const ink = css.getPropertyValue("--ink").trim() || "#1a2233";
      const bg = css.getPropertyValue("--bg").trim() || "#f4f6f9";
      const hl = css.getPropertyValue("--highlight").trim() || "#ffd84d";
      const font = getComputedStyle(document.body).fontFamily;
      x.fillStyle = ink;
      x.fillRect(0, 0, W, H);
      x.fillStyle = hl;
      x.beginPath();
      x.arc(W - 120, 160, 260, 0, Math.PI * 2);
      x.globalAlpha = 0.25;
      x.fill();
      x.globalAlpha = 1;
      x.direction = "rtl";
      x.textAlign = "right";
      x.fillStyle = bg;
      x.font = `600 44px ${font}`;
      x.fillText(date, W - 90, 200);
      x.font = `700 96px ${font}`;
      x.fillText(`${name} סיים/ה את היום`, W - 90, 330, W - 180);
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const time = minutes ? (h ? `${h}:${String(m).padStart(2, "0")} ש׳` : `${m} דק׳`) : "—";
      const rows: [string, string][] = [
        ["⏱", `${time} לימוד`],
        ["✅", `${sessions} מפגשי לימוד`],
        ["🔁", `${routines} שגרות`],
        ...(streak > 1 ? ([["🔥", `רצף של ${streak} ימים`]] as [string, string][]) : []),
      ];
      x.font = `600 72px ${font}`;
      rows.forEach(([e, t], i) => {
        const y = 560 + i * 150;
        x.fillText(`${t}  ${e}`, W - 90, y, W - 180);
      });
      x.globalAlpha = 0.7;
      x.font = `500 40px ${font}`;
      x.fillText("Unihub · האוניברסיטה הפתוחה", W - 90, H - 90);
      x.globalAlpha = 1;
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
      const file = new File([blob], "unihub-today.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Unihub" });
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    } catch {
      // cancelled share sheet
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={make} disabled={busy} className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
      <Icon name="camera" className="me-1 size-4" />
      שיתוף היום כתמונה
    </button>
  );
}
