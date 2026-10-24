"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { getAskContext, saveStuckQuestion } from "@/app/act";
import type { AskContext } from "@/app/practiceActions";
import { mailtoHref, telHref, tutorQuestionText } from "@/lib/practice";
import { range } from "@/lib/time";

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "numeric" }).format(new Date(iso + "T00:00:00Z"));

/**
 * Turns a stuck point into a well-formed question: what I tried, where I'm stuck, the book page.
 * Then copy it for the forum, open a mail draft, or take it to the next phone-tutoring hour.
 */
export function AskTutor({
  stuck,
  initial,
  onClose,
}: {
  stuck: { id: string; topic: string; course_code: string | null };
  /** preloaded context (otherwise fetched when opened) */
  initial?: AskContext;
  onClose?: () => void;
}) {
  const [ctx, setCtx] = useState<AskContext | null>(initial ?? null);
  const [tried, setTried] = useState(initial?.question?.tried ?? "");
  const [where, setWhere] = useState(initial?.question?.where_stuck ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [showPhone, setShowPhone] = useState(false);

  useEffect(() => {
    if (initial) return;
    let live = true;
    getAskContext(stuck.id, stuck.course_code)
      .then((c) => {
        if (!live) return;
        setCtx(c);
        if (c.question) {
          setTried(c.question.tried);
          setWhere(c.question.where_stuck);
        }
      })
      .catch(() => live && setCtx({ courseName: null, forumHref: null, question: null, phone: null, tutorial: null }));
    return () => {
      live = false;
    };
  }, [initial, stuck.id, stuck.course_code]);

  const bookHref = ctx?.question?.book_href ?? null;
  const text = () =>
    tutorQuestionText({
      courseName: ctx?.courseName ?? "הקורס",
      courseCode: stuck.course_code,
      topic: stuck.topic,
      tried,
      whereStuck: where,
      bookLink: bookHref && typeof window !== "undefined" ? window.location.origin + bookHref : bookHref,
    });
  const save = (asked_via?: "phone" | "forum" | "mail" | "meetup") =>
    saveStuckQuestion({ stuck_id: stuck.id, tried, where_stuck: where, ...(asked_via ? { asked_via } : {}) }).catch(() => {});

  const ta = "mt-1 w-full rounded-lg border border-rule bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none";
  return (
    <div className="mt-2 rounded-xl border border-rule bg-bg p-3 text-sm">
      <p className="font-medium">{stuck.topic}</p>
      {bookHref && (
        <Link href={bookHref} className="mt-1 inline-flex items-center gap-1 text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
          <Icon name="book" className="size-4" />
          לעמוד בספר
        </Link>
      )}
      <label className="mt-3 block">
        <span className="text-ink-soft">מה ניסיתי</span>
        <textarea dir="auto" value={tried} onChange={(e) => setTried(e.target.value)} onBlur={() => save()} rows={2} className={ta} placeholder="למשל: דירגתי ויצאה לי שורת אפסים, ניסיתי גם…" />
      </label>
      <label className="mt-2 block">
        <span className="text-ink-soft">איפה נתקעתי</span>
        <textarea dir="auto" value={where} onChange={(e) => setWhere(e.target.value)} onBlur={() => save()} rows={2} className={ta} placeholder="השלב המדויק שלא ברור לי" />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            const t = text();
            try {
              await navigator.clipboard.writeText(`${t.subject}\n\n${t.body}`);
              setNote(ctx?.forumHref ? "הועתק. אפשר להדביק בפורום." : "הועתק.");
            } catch {
              setNote("לא הצלחתי להעתיק.");
            }
            save("forum");
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rule bg-surface px-4 hover:border-ink"
        >
          <Icon name="copy" className="size-4" />
          העתקה לפורום
        </button>
        <a href={mailtoHref(text())} onClick={() => save("mail")} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rule bg-surface px-4 hover:border-ink">
          <Icon name="mail" className="size-4" />
          טיוטת מייל
        </a>
        <button
          type="button"
          onClick={() => {
            setShowPhone((v) => !v);
            save();
          }}
          aria-expanded={showPhone}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rule bg-surface px-4 hover:border-ink"
        >
          <Icon name="call" className="size-4" />
          לשאול בהנחיה הטלפונית
        </button>
      </div>
      {note && (
        <p className="mt-2 text-ink-soft" role="status">
          {note}{" "}
          {ctx?.forumHref && (
            <a href={ctx.forumHref} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4">
              לפורומי הקורס
            </a>
          )}
        </p>
      )}
      {showPhone && (
        <div className="mt-3 rounded-lg border border-rule bg-surface p-3">
          {!ctx ? (
            <p className="text-ink-soft">טוען…</p>
          ) : ctx.phone ? (
            <>
              <p>
                ההנחיה הטלפונית הבאה: <strong>{dayLabel(ctx.phone.date)}</strong> {range(ctx.phone.start_time, ctx.phone.end_time)}
                {ctx.phone.tutor ? ` · ${ctx.phone.tutor}` : ""}
              </p>
              {ctx.phone.phone && (
                <a href={telHref(ctx.phone.phone)} onClick={() => save("phone")} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 font-medium text-bg">
                  <Icon name="call" className="size-4" />
                  <bdi dir="ltr">{ctx.phone.phone}</bdi>
                </a>
              )}
              <p className="mt-2 text-xs text-ink-soft">כדאי להחזיק את השאלה פתוחה מול העיניים בזמן השיחה.</p>
            </>
          ) : (
            <p className="text-ink-soft">לא מצאתי שעת הנחיה טלפונית קרובה לקורס הזה בלוח.</p>
          )}
          {ctx?.tutorial && (
            <p className="mt-2 text-ink-soft">
              או במפגש ההנחיה הבא: {dayLabel(ctx.tutorial.date)} {range(ctx.tutorial.start_time, ctx.tutorial.end_time)}
            </p>
          )}
        </div>
      )}
      {onClose && (
        <button type="button" onClick={onClose} className="mt-3 text-ink-soft underline decoration-rule underline-offset-4">
          סגירה
        </button>
      )}
    </div>
  );
}
