"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addAssignmentFile, assignmentUploadUrl, deleteAssignmentFile, setAssignmentFileN } from "@/app/act";
import { Icon } from "@/components/Icon";
import { ASSIGNMENT_FILE_MAX, BOOKLET, SHEET_ACCEPT, guessAssignment, type AssignmentFile } from "@/lib/assignmentFiles";
import { fileSize } from "@/lib/meetupFiles";

function put(url: string, file: File, onPct: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "application/octet-stream"));
    x.setRequestHeader("x-upsert", "true");
    x.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error("ההעלאה נכשלה")));
    x.onerror = () => reject(new Error("ההעלאה נכשלה. בדקו את החיבור ונסו שוב."));
    x.send(file);
  });
}

type Pending = { file: File; n: string };

/**
 * The course's assignment sheets, uploaded once when the semester opens: drop all the files at
 * once, each is matched to its ממ"ן by its name (or set by hand), then read in the reader.
 */
export function AssignmentFiles({
  code,
  files,
  assignments,
  editable,
}: {
  code: string;
  files: AssignmentFile[];
  /** the course's assignments: n and "ממ״ן 11" */
  assignments: { n: string; label: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<{ n: number; of: number; pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const ns = assignments.map((a) => a.n);
  const label = (n: string) => (n === BOOKLET ? "חוברת המטלות (כולן)" : (assignments.find((a) => a.n === n)?.label ?? `מטלה ${n}`));
  const options = [...assignments.map((a) => ({ n: a.n, label: a.label })), { n: BOOKLET, label: label(BOOKLET) }];

  const pick = (list: FileList | null) => {
    setError(null);
    const all = [...(list ?? [])];
    const big = all.find((f) => f.size > ASSIGNMENT_FILE_MAX);
    if (big) return setError(`${big.name} גדול מ־50MB`);
    setQueue((q) => [...q, ...all.map((file) => ({ file, n: guessAssignment(file.name, ns) ?? "" }))]);
  };

  const upload = async () => {
    if (queue.some((q) => !q.n)) return setError("בחרו לכל קובץ לאיזו מטלה הוא שייך");
    setError(null);
    try {
      for (let i = 0; i < queue.length; i++) {
        const { file, n } = queue[i];
        setBusy({ n: i + 1, of: queue.length, pct: 0 });
        const { path, url } = await assignmentUploadUrl(code, file.name, file.size);
        await put(url, file, (pct) => setBusy({ n: i + 1, of: queue.length, pct }));
        // a PDF is shown without its extension; other files keep it (it tells what they are)
        await addAssignmentFile(code, n, file.name.replace(/\.pdf$/i, ""), path, file.size);
      }
      setQueue([]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "ההעלאה נכשלה");
    } finally {
      setBusy(null);
    }
  };

  const run = (f: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await f();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const select = (value: string, onChange: (v: string) => void, aria: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="shrink-0 rounded-lg border border-rule-strong bg-surface px-2 py-1 text-sm" aria-label={aria}>
      {!value && <option value="">איזו מטלה?</option>}
      {options.map((o) => (
        <option key={o.n} value={o.n}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <section className={`panel p-5 ${pending ? "opacity-80" : ""}`}>
      <h2 className="section-title">דפי המטלות</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {files.length ? "נפתחים בקורא ובטיימר הריכוז, ליד המעקב אחרי השאלות." : "מורידים פעם בסמסטר מאתר הקורס באופל ומעלים כאן, כולם יחד. כל קובץ מותאם לממ״ן שלו לפי השם."}
      </p>

      {files.length > 0 && (
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <Icon name="clip" className="size-4 shrink-0 text-ink-soft" />
              {f.pdf ? (
                <Link href={`/courses/${code}/assignment/${f.n}`} className="min-w-0 flex-1 truncate underline decoration-rule underline-offset-2 hover:text-ink" dir="auto">
                  {f.name}
                </Link>
              ) : (
                <a href={f.href ?? undefined} download className="min-w-0 flex-1 truncate underline decoration-rule underline-offset-2 hover:text-ink" dir="auto">
                  {f.name}
                </a>
              )}
              {f.size != null && <span className="text-xs tabular-nums text-ink-soft">{fileSize(f.size)}</span>}
              {editable ? select(f.n, (n) => run(() => setAssignmentFileN(f.id, n)), `המטלה של ${f.name}`) : <span className="text-sm text-ink-soft">{label(f.n)}</span>}
              {editable && (
                <button type="button" onClick={() => run(() => deleteAssignmentFile(f.id))} className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-bad" aria-label={`מחיקה: ${f.name}`}>
                  <Icon name="close" className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pick(e.dataTransfer.files);
            }}
            className={`mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center text-sm ${over ? "border-ink bg-bg" : "border-rule-strong"} ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            <Icon name="plus" className="size-5" />
            <span className="font-medium">{files.length ? "עוד קבצים" : "בחירת קבצים"}</span>
            <span className="text-ink-soft">או לגרור לכאן את כל קובצי המטלות. PDF נפתח בקורא, קבצים אחרים (zip, Word) נשמרים להורדה.</span>
            <input
              type="file"
              multiple
              accept={SHEET_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {queue.length > 0 && (
            <div className="mt-3">
              <ul className="space-y-2">
                {queue.map((q, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate" dir="auto">
                      {q.file.name.replace(/\.pdf$/i, "")}
                    </span>
                    {select(q.n, (n) => setQueue((xs) => xs.map((x, j) => (j === i ? { ...x, n } : x))), `המטלה של ${q.file.name}`)}
                    <button type="button" onClick={() => setQueue((xs) => xs.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-bg" aria-label={`הסרה: ${q.file.name}`}>
                      <Icon name="close" className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={upload} disabled={!!busy} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-bg disabled:opacity-60">
                  {queue.length === 1 ? "העלאת הקובץ" : `העלאת ${queue.length} הקבצים`}
                </button>
                {busy && (
                  <span className="text-xs tabular-nums text-ink-soft" role="status">
                    {busy.of > 1 ? `${busy.n} מתוך ${busy.of} · ` : ""}
                    {busy.pct}%
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-3 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
