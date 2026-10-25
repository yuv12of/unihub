"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addMeetupFile, addMeetupLink, deleteMeetupFile, meetupUploadUrl, setMeetupFilesDone } from "@/app/act";
import { Icon } from "@/components/Icon";
import { FILE_SLOTS, MEETUP_FILE_MAX, fileSize, type MeetupFile, type MeetupFileKind } from "@/lib/meetupFiles";

const ACCEPT = ".pdf,.note,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg,.heic,.zip,application/pdf,image/*";

function put(url: string, file: File, onPct: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    x.setRequestHeader("x-upsert", "true");
    x.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error("ההעלאה נכשלה")));
    x.onerror = () => reject(new Error("ההעלאה נכשלה. בדקו את החיבור ונסו שוב."));
    x.send(file);
  });
}

/**
 * The meetup's files: my notes, the tutor's files and the recording link. Asked for when the meetup
 * ends, and can be added any time afterwards from the meetup page.
 */
export function MeetupFiles({
  code,
  date,
  files,
  filesDone,
  recordingsUrl,
  ended,
  editable,
}: {
  code: string;
  date: string;
  files: MeetupFile[];
  filesDone: boolean;
  recordingsUrl: string | null;
  ended: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<{ kind: MeetupFileKind; pct: number; n: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(filesDone);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = files.filter((f) => !gone.has(f.id));
  const missing = !shown.some((f) => f.kind === "notes" || f.kind === "slides");

  const upload = async (kind: MeetupFileKind, list: FileList | null) => {
    const all = [...(list ?? [])];
    if (!all.length) return;
    setError(null);
    const big = all.find((f) => f.size > MEETUP_FILE_MAX);
    if (big) return setError(`${big.name} גדול מ־50MB`);
    try {
      for (let i = 0; i < all.length; i++) {
        const f = all[i];
        setBusy({ kind, pct: 0, n: i + 1, of: all.length });
        const { path, url } = await meetupUploadUrl(code, date, f.name, f.size);
        await put(url, f, (pct) => setBusy({ kind, pct, n: i + 1, of: all.length }));
        await addMeetupFile(code, date, kind, f.name, path, f.size);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "ההעלאה נכשלה");
    } finally {
      setBusy(null);
    }
  };

  const remove = (f: MeetupFile) =>
    start(async () => {
      setError(null);
      setGone((g) => new Set(g).add(f.id));
      try {
        await deleteMeetupFile(f.id);
        router.refresh();
      } catch (e) {
        setGone((g) => {
          const n = new Set(g);
          n.delete(f.id);
          return n;
        });
        setError((e as Error).message);
      }
    });

  const saveLink = () =>
    start(async () => {
      setError(null);
      try {
        await addMeetupLink(code, date, link);
        setLink("");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const markDone = (v: boolean) =>
    start(async () => {
      setDone(v);
      try {
        await setMeetupFilesDone(code, date, v);
      } catch (e) {
        setDone(!v);
        setError((e as Error).message);
      }
    });

  return (
    <section id="files" className={`panel scroll-mt-20 p-4 ${pending ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">קבצי המפגש</h2>
        {shown.length > 0 && <span className="text-sm text-ink-soft">{shown.length === 1 ? "קובץ אחד" : `${shown.length} קבצים`}</span>}
      </div>
      {ended && missing && !done && editable && (
        <p className="mt-1 text-sm text-ink-soft">המפגש הסתיים. שמרו כאן את ההערות ואת קבצי המנחה, כדי שיהיו במקום אחד לחזרה ולבחינה.</p>
      )}

      <ul className="mt-3 divide-y divide-rule">
        {FILE_SLOTS.map((slot) => {
          const mine = shown.filter((f) => f.kind === slot.kind || (slot.kind === "slides" && f.kind === "other"));
          const up = busy?.kind === slot.kind ? busy : null;
          return (
            <li key={slot.kind} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${mine.length ? "border-ok bg-ok text-bg" : "border-rule-strong"}`}
                  aria-hidden
                >
                  {mine.length > 0 && <Icon name="check" className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{slot.title}</p>
                  {!mine.length && (
                    <p className="text-xs text-ink-soft">
                      {slot.hint}
                      {slot.kind === "notes" && editable && (
                        <>
                          {" "}
                          <a href="/settings#share" className="underline decoration-rule underline-offset-2 hover:text-ink">
                            או שיתוף ישר מ־Notability
                          </a>
                        </>
                      )}
                    </p>
                  )}
                  {mine.length > 0 && (
                    <ul className="mt-1 space-y-1 text-sm">
                      {mine.map((f) => (
                        <li key={f.id} className="flex items-center gap-2">
                          <Icon name={f.isLink ? "play" : "clip"} className="size-3.5 shrink-0 text-ink-soft" />
                          {f.href ? (
                            <a href={f.href} target="_blank" rel="noreferrer" className="min-w-0 truncate underline decoration-rule underline-offset-2 hover:text-ink" dir="auto">
                              {f.name}
                            </a>
                          ) : (
                            <span className="min-w-0 truncate" dir="auto">
                              {f.name}
                            </span>
                          )}
                          {f.size != null && <span className="shrink-0 text-xs text-ink-soft tabular-nums">{fileSize(f.size)}</span>}
                          {editable && (
                            <button
                              type="button"
                              onClick={() => remove(f)}
                              className="ms-auto grid size-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-bad"
                              aria-label={`מחיקה: ${f.name}`}
                            >
                              <Icon name="close" className="size-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {editable && slot.kind !== "recording" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className={`btn cursor-pointer rounded-lg px-3 text-sm ${busy ? "pointer-events-none opacity-60" : ""}`}>
                        <Icon name="plus" className="size-4" />
                        {mine.length ? "עוד קובץ" : "העלאה"}
                        <input
                          type="file"
                          multiple
                          accept={ACCEPT}
                          className="sr-only"
                          disabled={!!busy}
                          onChange={(e) => {
                            upload(slot.kind, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {up && (
                        <span className="text-xs text-ink-soft tabular-nums" role="status">
                          {up.of > 1 ? `${up.n} מתוך ${up.of} · ` : ""}
                          {up.pct}%
                        </span>
                      )}
                    </div>
                  )}

                  {editable && slot.kind === "recording" && (
                    <form
                      className="mt-2 flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (link.trim()) saveLink();
                      }}
                    >
                      <input
                        type="url"
                        inputMode="url"
                        dir="ltr"
                        placeholder="https://"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        aria-label="קישור להקלטה"
                        className="min-w-0 flex-1 rounded-lg border border-rule-strong bg-surface px-2 py-1.5 text-sm"
                      />
                      <button type="submit" disabled={!link.trim() || pending} className="btn rounded-lg px-3 text-sm">
                        שמירה
                      </button>
                      {recordingsUrl && (
                        <a href={recordingsUrl} target="_blank" rel="noreferrer" className="text-xs text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink">
                          לדף ההקלטות באופל
                        </a>
                      )}
                    </form>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      {editable && ended && missing && (
        <p className="mt-3 text-xs text-ink-soft">
          {done ? (
            <>
              סומן שאין קבצים למפגש הזה.{" "}
              <button type="button" onClick={() => markDone(false)} className="underline underline-offset-2 hover:text-ink">
                ביטול
              </button>
            </>
          ) : (
            <button type="button" onClick={() => markDone(true)} className="underline underline-offset-2 hover:text-ink">
              אין קבצים למפגש הזה, להפסיק להזכיר
            </button>
          )}
        </p>
      )}
    </section>
  );
}
