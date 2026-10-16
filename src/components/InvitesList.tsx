"use client";

import { useTransition } from "react";
import { answerInvite } from "@/app/actions";
import type { Invite } from "@/lib/userdata";

const when = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "numeric" }).format(new Date(iso + "T00:00:00Z"));

/** Event invitations from friends, waiting for an answer. */
export function InvitesList({ invites, names = {} }: { invites: Invite[]; names?: Record<string, { name: string }> }) {
  const [pending, start] = useTransition();
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">הזמנות</h2>
      <ul className="panel divide-y divide-rule overflow-hidden">
        {invites.map((i) => (
          <li key={i.event.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{i.event.title}</div>
              <div className="text-sm text-ink-soft">
                {when(i.event.date)}
                {i.event.start_time ? `, ${i.event.start_time}–${i.event.end_time ?? ""}` : ""}
                {i.event.location ? ` · ${i.event.location}` : ""}
                {names[i.inviter] ? ` · מאת ${names[i.inviter].name}` : ""}
              </div>
            </div>
            <button disabled={pending} onClick={() => start(() => answerInvite(i.event.id, "accepted"))} className="rounded-full bg-ink px-3 py-1.5 text-sm text-bg">
              מגיע/ה
            </button>
            <button
              disabled={pending}
              onClick={() => start(() => answerInvite(i.event.id, "declined"))}
              className="rounded-full border border-rule px-3 py-1.5 text-sm text-ink-soft"
            >
              לא הפעם
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
