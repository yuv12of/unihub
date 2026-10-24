"use client";

import { useState, useTransition } from "react";
import { acceptExamCandidate, dismissExamCandidate } from "@/app/act";
import { Icon } from "@/components/Icon";
import { range } from "@/lib/time";

export interface Candidate {
  id: string;
  course_code: string;
  moed: string;
  date: string;
  start_time: string | null;
  short: string;
  color: string;
}

const fmt = (iso: string) => new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

export function ExamCandidateList({ rows }: { rows: Candidate[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const live = rows.filter((r) => !gone.has(r.id));
  if (!live.length) return null;
  // one date per מועד: accepting one hides the other dates of the same מועד
  const act = (r: Candidate, accept: boolean) =>
    start(async () => {
      try {
        if (accept) await acceptExamCandidate(r.id);
        else await dismissExamCandidate(r.id);
        setGone((g) => new Set([...g, r.id, ...(accept ? rows.filter((x) => x.course_code === r.course_code && x.moed === r.moed).map((x) => x.id) : [])]));
        setMsg(null);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "לא נשמר");
      }
    });
  const twoDates = (r: Candidate) => live.filter((x) => x.course_code === r.course_code && x.moed === r.moed).length > 1;
  return (
    <div>
      <h2 className="section-title mb-1">מועדי הבחינות פורסמו</h2>
      <p className="mb-3 text-sm text-ink-soft">מצאתי בדואר מהאוניברסיטה. אפשר לבחור תאריך אחד לכל מועד (כמו בהרשמה בשאילתא).</p>
      <ul className="panel divide-y divide-rule overflow-hidden">
        {live.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{r.short}</span>
              <span className="text-ink-soft"> · מועד {r.moed}{twoDates(r) ? " (אחד מהתאריכים)" : ""}</span>
              <span className="block text-sm">
                {fmt(r.date)}
                {r.start_time ? ` · ${range(r.start_time)}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 gap-2">
              <button type="button" disabled={pending} onClick={() => act(r, true)} className="inline-flex items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-sm text-bg disabled:opacity-50">
                <Icon name="plus" className="size-3.5" />
                הוספה
              </button>
              <button type="button" disabled={pending} onClick={() => act(r, false)} className="rounded-lg border border-rule px-3 py-1.5 text-sm hover:border-ink-soft disabled:opacity-50">
                לא נכון
              </button>
            </span>
          </li>
        ))}
      </ul>
      {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
    </div>
  );
}
