"use client";

import { useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { setSessionStep } from "@/app/act";
import { Icon } from "@/components/Icon";
import type { AgendaStep, StepKind } from "@/lib/agenda";

const ICON: Record<StepKind, Parameters<typeof Icon>[0]["name"]> = {
  read: "book",
  video: "play",
  cards: "list",
  questions: "help",
  assignment: "pencil",
};

const EVENT = "agenda-change";
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "{}";
  } catch {
    return "{}";
  }
};

/**
 * The 2–4 concrete steps of one study session, each with a tick box. Ticks are saved per session
 * (table session_steps, so phone and iPad agree); a copy in localStorage keeps them working before
 * the table exists and in demo mode.
 */
/** `sessionKey` is lib/planner sessionKey(session), computed on the server (planner is server-only). */
export function SessionAgenda({ sessionKey: key, steps, done = [] }: { sessionKey: string; steps: AgendaStep[]; done?: string[] }) {
  const store = `agenda:${key}`;
  // Local choices ({ stepId: ticked }) win over the server copy until the page reloads with it.
  const raw = useSyncExternalStore(subscribe, () => read(store), () => "{}");
  let local: Record<string, boolean> = {};
  try {
    local = JSON.parse(raw);
  } catch {}
  const ticked = new Set(steps.map((s) => s.id).filter((id) => local[id] ?? done.includes(id)));
  const [, start] = useTransition();
  if (!steps.length) return null;

  const toggle = (id: string) => {
    const on = !ticked.has(id);
    try {
      localStorage.setItem(store, JSON.stringify({ ...local, [id]: on }));
    } catch {}
    window.dispatchEvent(new Event(EVENT));
    if (on) navigator.vibrate?.(15);
    start(async () => {
      try {
        await setSessionStep(key, id, on);
      } catch {
        // kept locally; the server copy catches up next time
      }
    });
  };

  const count = steps.filter((s) => ticked.has(s.id)).length;
  return (
    <ul className="mt-2 space-y-1" aria-label={`שלבים במפגש, ${count} מתוך ${steps.length}`}>
      {steps.map((s) => {
        const on = ticked.has(s.id);
        const external = s.href?.startsWith("http");
        return (
          <li key={s.id} className="flex items-start gap-2 text-sm">
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={s.text}
              onClick={() => toggle(s.id)}
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${on ? "border-ink bg-ink text-bg" : "border-rule hover:border-ink-soft"}`}
            >
              {on && <Icon name="check" className="size-3.5" />}
            </button>
            <Icon name={ICON[s.kind]} className="mt-0.5 size-4 shrink-0 text-ink-soft" />
            {s.href ? (
              external ? (
                <a href={s.href} target="_blank" rel="noreferrer" className={`min-w-0 underline decoration-rule underline-offset-2 hover:text-ink ${on ? "text-ink-soft line-through" : ""}`}>
                  {s.text}
                </a>
              ) : (
                <Link href={s.href} className={`min-w-0 underline decoration-rule underline-offset-2 hover:text-ink ${on ? "text-ink-soft line-through" : ""}`}>
                  {s.text}
                </Link>
              )
            ) : (
              <span className={`min-w-0 ${on ? "text-ink-soft line-through" : ""}`}>{s.text}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
