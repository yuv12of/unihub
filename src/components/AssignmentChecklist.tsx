"use client";
import { duration } from "@/lib/time";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ReadChips } from "@/components/ReadChips";
import { AnswerUpload, OnlineLink } from "@/components/AssignmentLinks";
import { MathText } from "@/components/MathText";
import type { ReadingItem } from "@/lib/readings";

import { useOptimistic, useState, useTransition } from "react";
import { saveProgress, saveReview } from "@/app/act";
import type { Progress, Status } from "@/lib/progress";

export interface ChecklistItem {
  n: string;
  label: string; // e.g. ממ״ן 01
  due: string; // display date
  weight: number;
  past: boolean;
  progress: Progress;
  /** minutes logged on this assignment's study sessions */
  spent?: number;
  review?: { minutes_spent: number | null; difficulty: number | null; hard: string | null } | null;
  /** the assignment's material, linked to the user's books */
  reading?: ReadingItem | null;
  /** course forum posts that mention this assignment */
  forum?: { topic: string; href: string }[];
  /** the assignment's question sheet in the reader, when it was uploaded */
  sheetHref?: string | null;
  /** file / online / participation */
  type?: "file" | "online" | "participation";
  /** online assignments: the link to the quiz */
  link?: string | null;
  /** file assignments: the file I submitted */
  answer?: { id: string; name: string; href: string | null } | null;
  /** extra files of the assignment (a zip of starter files) */
  extras?: { id: string; name: string; href: string | null }[];
}

type Patch = { n: string; progress: Progress };

export function AssignmentChecklist({
  code,
  color,
  items,
  editable,
}: {
  code: string;
  color: string;
  items: ChecklistItem[];
  editable: boolean;
}) {
  const [optimistic, apply] = useOptimistic(items, (state, patch: Patch) =>
    state.map((it) => (it.n === patch.n ? { ...it, progress: patch.progress } : it)),
  );
  const [, startTransition] = useTransition();
  const [asking, setAsking] = useState<string | null>(null);

  function save(n: string, status: Status, grade: number | null) {
    if (status === "submitted" && !items.find((i) => i.n === n)?.review) setAsking(n);
    startTransition(async () => {
      apply({ n, progress: { status, grade } });
      await saveProgress({ code, n, status, grade });
    });
  }

  return (
    <ul className="mt-4 divide-y divide-rule border-t border-rule">
      {optimistic.map((it) => {
        const done = it.progress.status === "submitted";
        const skipped = it.progress.status === "skipped";
        return (
          <li key={it.n} className="py-2">
          <div className="flex min-h-11 items-center gap-3">
            <label className="flex flex-1 items-center gap-3 min-w-0 cursor-pointer">
              <input
                type="checkbox"
                className="size-5 shrink-0"
                style={{ accentColor: color }}
                checked={done}
                disabled={!editable}
                onChange={(e) => save(it.n, e.target.checked ? "submitted" : "todo", null)}
                aria-label={`${it.label} הוגש`}
              />
              <span className={`truncate ${skipped ? "line-through text-ink-soft" : ""}`}>
                {it.label}
                <span className="text-ink-soft text-sm"> {it.due}, משקל {it.weight}</span>
              </span>
            </label>
            {it.sheetHref && (
              <Link href={it.sheetHref} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rule px-2.5 py-1 text-xs hover:border-ink">
                <Icon name="clip" className="size-3.5" />
                דף המטלה
              </Link>
            )}
            {done ? (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                placeholder="ציון"
                defaultValue={it.progress.grade ?? ""}
                disabled={!editable}
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v !== it.progress.grade) save(it.n, "submitted", v);
                }}
                className="w-16 shrink-0 rounded border border-rule bg-transparent px-2 py-1 text-center tabular-nums"
                aria-label={`ציון ב${it.label}`}
              />
            ) : (
              editable &&
              !it.past && (
                <button
                  type="button"
                  onClick={() => save(it.n, skipped ? "todo" : "skipped", null)}
                  className="shrink-0 text-xs text-ink-soft underline underline-offset-4 decoration-rule"
                >
                  {skipped ? "בטל ויתור" : "ויתור"}
                </button>
              )
            )}
          </div>
          {it.reading && !done && !skipped && (
            <div className="ms-8 mb-1 text-xs text-ink-soft">
              חומר: <MathText text={it.reading.label} />
              {it.reading.estimated ? " (הערכה, יתעדכן כשהמטלה תיפתח)" : ""}
              <ReadChips links={it.reading.links} className="mt-1" />
            </div>
          )}
          {editable && (it.type === "online" || it.type === "file" || (it.extras?.length ?? 0) > 0) && (
            <div className="ms-8 mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {it.type === "online" && <OnlineLink code={code} n={it.n} url={it.link ?? null} />}
              {it.type === "file" && <AnswerUpload code={code} n={it.n} answer={it.answer ?? null} />}
              {it.extras?.map((x) => (
                <a key={x.id} href={x.href ?? undefined} download className="inline-flex items-center gap-1 text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink" dir="auto">
                  <Icon name="clip" className="size-3" />
                  {x.name}
                </a>
              ))}
            </div>
          )}
          {it.forum && it.forum.length > 0 && (
            <ul className="ms-8 mb-1 space-y-0.5 text-xs">
              {it.forum.map((f, i) => (
                <li key={i}>
                  <a href={f.href} className="text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink">
                    בפורום: {f.topic}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {it.review && (it.review.minutes_spent || it.review.difficulty) ? (
            <p className="ms-8 text-xs text-ink-soft">
              {it.review.minutes_spent ? `${duration(it.review.minutes_spent)} בפועל` : ""}
              {it.review.difficulty ? ` · קושי ${it.review.difficulty}/5` : ""}
              {it.review.hard ? ` · ${it.review.hard}` : ""}
            </p>
          ) : null}
          {asking === it.n && editable && <Autopsy code={code} item={it} onDone={() => setAsking(null)} />}
          </li>
        );
      })}
    </ul>
  );
}

const FACES = ["😌", "🙂", "😐", "😓", "🥵"];

/** 30 seconds after submitting: how long it really took and what was hard. Feeds future estimates. */
function Autopsy({ code, item, onDone }: { code: string; item: ChecklistItem; onDone: () => void }) {
  const [hours, setHours] = useState(item.spent ? String(Math.round(item.spent / 6) / 10) : "");
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [hard, setHard] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-2 ms-8 space-y-2 rounded-xl bg-bg p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await saveReview({ code, n: item.n, minutes_spent: hours ? Math.round(Number(hours) * 60) : null, difficulty, hard: hard.trim() || null }).catch(() => {});
          onDone();
        });
      }}
    >
      <p className="font-medium">הוגש 🎉 איך הלך?</p>
      {item.type === "file" && !item.answer && (
        <p className="text-xs">
          <AnswerUpload code={code} n={item.n} answer={null} />
        </p>
      )}
      <label className="flex items-center gap-2">
        כמה זמן השקעת?
        <input value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className="w-16 rounded border border-rule bg-surface px-2 py-1 text-center" aria-label="שעות" />
        שעות
      </label>
      <div className="flex items-center gap-1" role="group" aria-label="כמה קשה">
        <span className="me-1">כמה קשה?</span>
        {FACES.map((f, i) => (
          <button key={f} type="button" onClick={() => setDifficulty(i + 1)} aria-pressed={difficulty === i + 1} aria-label={`קושי ${i + 1} מתוך 5`} className={`grid size-8 place-items-center rounded-full text-lg ${difficulty === i + 1 ? "bg-highlight ring-1 ring-ink" : ""}`}>
            {f}
          </button>
        ))}
      </div>
      <input value={hard} onChange={(e) => setHard(e.target.value)} maxLength={500} placeholder="מה היה הכי קשה? (לא חובה)" className="w-full rounded border border-rule bg-surface px-2 py-1" />
      <div className="flex gap-3">
        <button disabled={pending} className="rounded-lg bg-ink px-3 py-1.5 text-bg">שמירה</button>
        <button type="button" onClick={onDone} className="text-ink-soft">דילוג</button>
      </div>
    </form>
  );
}
