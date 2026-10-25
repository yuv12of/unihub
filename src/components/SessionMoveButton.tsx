"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SessionEditor, type EditorCourse } from "@/components/SessionEditor";

/** Today's session rows: a small "change time" button that opens the session editor. */
export function SessionMoveButton(props: {
  sessionKey: string;
  title: string;
  date: string;
  start: string;
  minutes: number;
  moved: boolean;
  today: string;
  courseCode: string;
  courses: EditorCourse[];
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-ink [@media(pointer:coarse)]:size-11"
        aria-label={`שינוי מפגש: ${props.title}`}
        title="שינוי זמן או קורס"
      >
        <Icon name="pencil" className="size-4" />
      </button>
      {open && <SessionEditor {...props} onClose={() => setOpen(false)} onDone={setMsg} />}
      {msg && (
        <span className="sr-only" role="status">
          {msg}
        </span>
      )}
    </>
  );
}
