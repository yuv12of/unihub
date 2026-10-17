"use client";

import { useState, useTransition } from "react";
import { createFamilyLink, deleteFamilyLink } from "@/app/familyActions";

/** Private read-only links for family: study time, exams, deadlines, streaks, and an encouragement button. */
export function FamilyLinks({ links }: { links: { token: string; name: string; last_seen: string | null }[] }) {
  const [name, setName] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const url = (t: string) => `${location.origin}/family/${t}`;
  const share = async (t: string, who: string) => {
    const u = url(t);
    try {
      if (navigator.share) await navigator.share({ title: "Unihub", text: `${who}, ככה אפשר לראות איך הלימודים שלי מתקדמים:`, url: u });
      else {
        await navigator.clipboard.writeText(u);
        setMade("הקישור הועתק");
      }
    } catch {}
  };
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await createFamilyLink(name);
            if (!r.ok || !r.token) return setError(r.error ?? "לא נוצר");
            setName("");
            await share(r.token, name);
          });
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="למי? (אמא, אבא, בן/בת זוג)" className="min-w-0 flex-1 rounded-lg border border-rule bg-surface px-3 py-2 text-sm" />
        <button disabled={pending || !name.trim()} className="rounded-lg bg-ink px-4 text-sm font-medium text-bg disabled:opacity-40">
          יצירת קישור
        </button>
      </form>
      {links.length > 0 && (
        <ul className="divide-y divide-rule rounded-xl border border-rule text-sm">
          {links.map((l) => (
            <li key={l.token} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{l.name}</span>
                <span className="block text-xs text-ink-soft">
                  {l.last_seen ? `נכנס/ה לאחרונה ${new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", timeZone: "Asia/Jerusalem" }).format(new Date(l.last_seen))}` : "עוד לא נכנס/ה"}
                </span>
              </span>
              <button type="button" onClick={() => share(l.token, l.name)} className="text-ink-soft underline underline-offset-4 decoration-rule">
                שליחה
              </button>
              <button type="button" onClick={() => start(() => deleteFamilyLink(l.token))} className="text-ink-soft underline underline-offset-4 decoration-rule">
                ביטול
              </button>
            </li>
          ))}
        </ul>
      )}
      {made && <p className="text-sm">{made}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
