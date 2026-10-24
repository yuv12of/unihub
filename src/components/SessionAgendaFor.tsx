import { agendaFor } from "@/lib/agendaData";
import { SessionAgenda } from "@/components/SessionAgenda";
import type { Session } from "@/lib/planner";

/** Server side of the session agenda: loads the data once per request and renders the tick list. */
export async function SessionAgendaFor({ session }: { session: Session }) {
  const { steps, done } = await agendaFor(session);
  return <SessionAgenda session={session} steps={steps} done={done} />;
}
