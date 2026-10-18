"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Add a course book: the PDF goes straight to private storage (signed link, with progress), then
 * the server splits it into chapters. Big books take a minute or two to split.
 */
export function BookUpload({ courses, defaultCourse }: { courses: { code: string; short: string }[]; defaultCourse?: string }) {
  const [open, setOpen] = useState(false);
  const [course, setCourse] = useState(defaultCourse ?? courses[0]?.code ?? "");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<{ step: "idle" | "upload" | "split" | "done" | "error"; pct?: number; msg?: string }>({ step: "idle" });
  const router = useRouter();
  const busy = stage.step === "upload" || stage.step === "split";

  const run = async () => {
    if (!file || !course) return;
    const name = title.trim() || file.name.replace(/\.pdf$/i, "");
    try {
      setStage({ step: "upload", pct: 0 });
      const r = await fetch("/api/books/raw", { method: "POST", body: JSON.stringify({ name: file.name }) });
      const raw = (await r.json()) as { path?: string; url?: string; error?: string };
      if (!raw.url || !raw.path) throw new Error(raw.error ?? "לא התקבל קישור העלאה");
      await new Promise<void>((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open("PUT", raw.url!);
        x.setRequestHeader("Content-Type", "application/pdf");
        x.setRequestHeader("x-upsert", "true");
        x.upload.onprogress = (e) => e.lengthComputable && setStage({ step: "upload", pct: Math.round((e.loaded / e.total) * 100) });
        x.onload = () => (x.status < 300 ? resolve() : reject(new Error("ההעלאה נכשלה")));
        x.onerror = () => reject(new Error("ההעלאה נכשלה"));
        x.send(file);
      });
      setStage({ step: "split" });
      const p = await fetch("/api/books/process", { method: "POST", body: JSON.stringify({ path: raw.path, course, title: name }) });
      const res = (await p.json()) as { chapters?: number; pages?: number; error?: string };
      if (!p.ok) throw new Error(res.error ?? "החלוקה לפרקים נכשלה");
      setStage({ step: "done", msg: `נוסף: ${res.pages} עמודים, ${res.chapters} פרקים.` });
      setFile(null);
      setTitle("");
      router.refresh();
    } catch (e) {
      setStage({ step: "error", msg: e instanceof Error ? e.message : "משהו השתבש" });
    }
  };

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2 text-sm hover:border-ink">
        <Icon name="plus" className="size-4" />
        הוספת ספר
      </button>
    );

  return (
    <form
      className="panel max-w-xl space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <h2 className="section-title">הוספת ספר</h2>
      <p className="text-sm text-ink-soft">קובץ PDF של ספר הקורס. הוא נשמר רק בחשבון שלכם ומחולק לפרקים לפי תוכן העניינים שלו.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">קורס</span>
          <select value={course} onChange={(e) => setCourse(e.target.value)} className="w-full rounded-lg border border-rule bg-bg px-3 py-2">
            {courses.map((c) => (
              <option key={c.code} value={c.code}>
                {c.short}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">שם הספר</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file?.name.replace(/\.pdf$/i, "") ?? "למשל: כרך א"} className="w-full rounded-lg border border-rule bg-bg px-3 py-2" />
        </label>
      </div>
      <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:me-3 file:rounded-full file:border file:border-rule file:bg-surface file:px-4 file:py-2" />
      {stage.step === "upload" && (
        <div className="h-1.5 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuenow={stage.pct} aria-valuemin={0} aria-valuemax={100} aria-label="העלאה">
          <div className="h-full bg-ink transition-[width]" style={{ width: `${stage.pct ?? 0}%` }} />
        </div>
      )}
      <p className="text-sm" aria-live="polite">
        {stage.step === "upload" && `מעלה… ${stage.pct ?? 0}%`}
        {stage.step === "split" && "מחלק לפרקים ושומר את הטקסט. בספר גדול זה לוקח דקה-שתיים."}
        {(stage.step === "done" || stage.step === "error") && stage.msg}
      </p>
      <div className="flex gap-2">
        <button disabled={!file || !course || busy} className="rounded-full bg-ink px-5 py-2 font-medium text-bg disabled:opacity-40">
          {busy ? "רגע…" : "הוספה"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full px-4 py-2 text-ink-soft">
          סגירה
        </button>
      </div>
    </form>
  );
}
