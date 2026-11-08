"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addAssignmentFile, assignmentUploadUrl, deleteAssignmentFile, setAssignmentLink, setAssignmentsUrl } from "@/app/act";
import { Icon } from "@/components/Icon";
import { ANSWER_ACCEPT, ASSIGNMENT_FILE_MAX } from "@/lib/assignmentFiles";

const linkCls = "inline-flex items-center gap-1 text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink";

function put(url: string, file: File) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    x.setRequestHeader("x-upsert", "true");
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error("ההעלאה נכשלה")));
    x.onerror = () => reject(new Error("ההעלאה נכשלה. בדקו את החיבור ונסו שוב."));
    x.send(file);
  });
}

/** A link with a small inline editor: paste, save, or clear. */
function LinkEditor({
  url,
  label,
  empty,
  onSave,
  startEditing,
  onClose,
}: {
  url: string | null;
  label: string;
  empty: string;
  onSave: (v: string) => Promise<unknown>;
  startEditing?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditingRaw] = useState(!!startEditing);
  const setEditing = (v: boolean) => {
    setEditingRaw(v);
    if (!v) onClose?.();
  };
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (v: string) =>
    start(async () => {
      setError(null);
      try {
        await onSave(v);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  if (!editing)
    return (
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className={linkCls}>
            {label}
            <Icon name="chevronLeft" className="size-3" />
          </a>
        ) : (
          <span className="text-ink-soft">{empty}</span>
        )}
        <button type="button" onClick={() => setEditing(true)} className={linkCls}>
          <Icon name="pencil" className="size-3" />
          {url ? "עריכה" : "הוספת קישור"}
        </button>
      </span>
    );
  return (
    <form
      className="flex w-full max-w-md flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
    >
      <input
        autoFocus
        type="url"
        inputMode="url"
        dir="ltr"
        placeholder="https://opal.openu.ac.il/…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={label}
        className="min-w-0 flex-1 rounded-lg border border-rule-strong bg-surface px-2 py-1 text-sm"
      />
      <button disabled={pending} className="btn rounded-lg px-3 text-sm">
        שמירה
      </button>
      {url && (
        <button type="button" disabled={pending} onClick={() => save("")} className="text-sm text-ink-soft hover:text-bad">
          הסרה
        </button>
      )}
      <button type="button" onClick={() => setEditing(false)} className="text-sm text-ink-soft hover:text-ink">
        ביטול
      </button>
      {error && (
        <p className="w-full text-xs text-bad" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** An online assignment (ממ"ח): the link to its quiz on Opal. */
export function OnlineLink({ code, n, url, startEditing, onClose }: { code: string; n: string; url: string | null; startEditing?: boolean; onClose?: () => void }) {
  return <LinkEditor url={url} label="פתיחת המטלה באופל" empty="אין קישור למטלה." onSave={(v) => setAssignmentLink(code, n, v)} startEditing={startEditing} onClose={onClose} />;
}

/** The course's Opal page with all its assignments. */
export function AllAssignmentsLink({ code, url, startEditing, onClose }: { code: string; url: string | null; startEditing?: boolean; onClose?: () => void }) {
  return <LinkEditor url={url} label="כל המטלות של הקורס באופל" empty="אין קישור לדף המטלות באופל." onSave={(v) => setAssignmentsUrl(code, v)} startEditing={startEditing} onClose={onClose} />;
}

/**
 * Uploading the file I submitted, for a button of the caller's own: open() picks the file,
 * `input` must be rendered once.
 */
export function useAnswerUpload(code: string, n: string) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > ASSIGNMENT_FILE_MAX) return setError("הקובץ גדול מ־50MB");
    setError(null);
    setBusy(true);
    try {
      const { path, url } = await assignmentUploadUrl(code, f.name, f.size);
      await put(url, f);
      await addAssignmentFile(code, n, f.name, path, f.size, "answer");
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "ההעלאה נכשלה");
    } finally {
      setBusy(false);
    }
  };
  const input = (
    <input
      ref={ref}
      type="file"
      accept={ANSWER_ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        upload(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  return { open: () => ref.current?.click(), input, busy, error };
}

/** The file I submitted for a file assignment: upload it when done, open it later. */
export function AnswerUpload({ code, n, answer }: { code: string; n: string; answer: { id: string; name: string; href: string | null } | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > ASSIGNMENT_FILE_MAX) return setError("הקובץ גדול מ־50MB");
    setError(null);
    setBusy(true);
    try {
      const { path, url } = await assignmentUploadUrl(code, f.name, f.size);
      await put(url, f);
      await addAssignmentFile(code, n, f.name, path, f.size, "answer");
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "ההעלאה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {answer ? (
        <>
          <a href={answer.href ?? undefined} target="_blank" rel="noreferrer" className={linkCls} dir="auto">
            <Icon name="check" className="size-3" />
            ההגשה שלי: {answer.name}
          </a>
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className={linkCls}>
            החלפה
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  await deleteAssignmentFile(answer.id);
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              })
            }
            className={linkCls}
            aria-label={`מחיקת ההגשה ${answer.name}`}
          >
            <Icon name="close" className="size-3" />
          </button>
        </>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className={linkCls}>
          <Icon name="clip" className="size-3" />
          {busy ? "מעלה…" : "העלאת הקובץ שהגשתי"}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ANSWER_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <span className="text-bad" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/** The course's Opal assignments page as a button, with a small edit button next to it. */
export function AllAssignmentsButton({ code, url, editable }: { code: string; url: string | null; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <div className="w-full">
        <AllAssignmentsLink code={code} url={url} startEditing onClose={() => setEditing(false)} />
      </div>
    );
  if (url)
    return (
      <span className="inline-flex items-center gap-0.5">
        <a href={url} target="_blank" rel="noreferrer" className="btn">
          כל המטלות באופל
          <Icon name="chevronLeft" className="size-4" />
        </a>
        {editable && (
          <button type="button" className="btn-ghost size-9 !px-0" aria-label="עריכת הקישור לדף המטלות באופל" onClick={() => setEditing(true)}>
            <Icon name="pencil" className="size-4" />
          </button>
        )}
      </span>
    );
  return editable ? (
    <button type="button" className="btn" onClick={() => setEditing(true)}>
      <Icon name="plus" className="size-4" />
      קישור לדף המטלות באופל
    </button>
  ) : null;
}
