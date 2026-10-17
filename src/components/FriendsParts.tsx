"use client";

import { useState, useTransition } from "react";
import { answerFollow, followUser, removeFollower, saveShare, searchPeople, unfollow, type ShareSettings } from "@/app/actions";
import { Avatar } from "@/components/Avatar";

const btn = "rounded-full px-3 py-1.5 text-sm disabled:opacity-50";
const primary = `${btn} bg-ink text-bg`;
const quiet = `${btn} border border-rule text-ink-soft hover:border-ink`;

export function FollowRequest({ id, name, avatar, iFollow }: { id: string; name: string; avatar: string | null; iFollow: string | null }) {
  const [pending, start] = useTransition();
  const [accepted, setAccepted] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar name={name} url={avatar} />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-ink-soft">{accepted ? "אושר. לעקוב גם אחריו/ה?" : "רוצה לעקוב אחריך"}</div>
      </div>
      {!accepted ? (
        <>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                await answerFollow(id, true);
                setAccepted(true);
              })
            }
            className={primary}
          >
            אישור
          </button>
          <button disabled={pending} onClick={() => start(() => answerFollow(id, false))} className={quiet}>
            דחייה
          </button>
        </>
      ) : (
        !iFollow && (
          <button disabled={pending} onClick={() => start(() => followUser(id))} className={primary}>
            לעקוב בחזרה
          </button>
        )
      )}
    </li>
  );
}

export function PersonActions({ id, iFollow, followsMe }: { id: string; iFollow: string | null; followsMe: string | null }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex shrink-0 gap-2">
      {!iFollow && (
        <button disabled={pending} onClick={() => start(() => followUser(id))} className={primary}>
          {followsMe === "accepted" ? "לעקוב בחזרה" : "לעקוב"}
        </button>
      )}
      {iFollow && (
        <button disabled={pending} onClick={() => start(() => unfollow(id))} className={quiet}>
          {iFollow === "pending" ? "ביטול בקשה" : "הפסקת מעקב"}
        </button>
      )}
      {followsMe === "accepted" && (
        <button disabled={pending} onClick={() => start(() => removeFollower(id))} className={quiet} title="הסרה מהעוקבים שלך">
          הסרה
        </button>
      )}
    </span>
  );
}

export function FriendsSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchPeople>> | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setResults(await searchPeople(q)));
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="שם או כתובת מייל"
          className="min-w-0 flex-1 rounded-lg border border-rule bg-surface px-3 py-2"
          aria-label="חיפוש אנשים"
        />
        <button disabled={pending || q.trim().length < 2} className="rounded-lg bg-ink px-4 py-2 text-sm text-bg disabled:opacity-50">
          חיפוש
        </button>
      </form>
      {results && (
        <ul className="mt-3 space-y-2">
          {results.length === 0 && (
            <li className="text-sm text-ink-soft">לא נמצא. רק מי שנרשם ל־Unihub ואושר מופיע כאן (במייל צריך כתובת מלאה).</li>
          )}
          {results.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Avatar name={p.name} url={p.avatar_url} emoji={p.avatar_emoji} color={p.avatar_color} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <PersonActions id={p.id} iFollow={p.i_follow} followsMe={p.follows_me} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ShareSettingsForm({ initial }: { initial: ShareSettings }) {
  const [s, setS] = useState<ShareSettings>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const update = (next: ShareSettings) => {
    setS(next);
    setSaved(false);
    start(async () => {
      await saveShare(next);
      setSaved(true);
    });
  };
  const box = (key: keyof ShareSettings, label: string, sub?: string, disabled = false) => (
    <label className={`flex items-start gap-2.5 ${disabled ? "opacity-40" : ""}`}>
      <input
        type="checkbox"
        className="mt-1 size-4"
        disabled={disabled}
        checked={!!s[key] && !disabled}
        onChange={(e) => update({ ...s, [key]: e.target.checked })}
      />
      <span>
        {label}
        {sub && <span className="block text-xs text-ink-soft">{sub}</span>}
      </span>
    </label>
  );
  return (
    <div className="mt-4 space-y-3 text-sm">
      {box("courses", "הקורסים שלי", "שמות הקורסים ומועדי הבחינות")}
      {box("progress", "התקדמות במטלות", "כמה נקודות מטלה צברתי", !s.courses)}
      {box("grades", "ציונים", "ממוצע במטלות", !s.progress || !s.courses)}
      {box("study", "שעות לימוד", "כמה למדתי השבוע (מפגשים שסימנתי)")}
      {box("routines", "שגרה והרגלים", "השגרות שלי והרצפים")}
      <fieldset>
        <legend>הלו״ז שלי</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(
            [
              ["none", "לא לשתף"],
              ["busy", "רק מתי אני עסוק/ה"],
              ["details", "עם פרטים"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={s.schedule === v}
              onClick={() => update({ ...s, schedule: v })}
              className={`rounded-full border px-3 py-1 ${s.schedule === v ? "border-ink bg-ink text-bg" : "border-rule text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="h-4 text-xs text-ink-soft" aria-live="polite">
        {pending ? "שומר…" : saved ? "נשמר" : ""}
      </p>
    </div>
  );
}
