"use client";

import { createContext, useActionState, type ReactNode } from "react";

type Result = void | { failed: string } | unknown;

/** True while the last submit of the surrounding ActionForm failed (SaveButton then doesn't say "saved"). */
export const FormFailed = createContext(false);

/**
 * A <form> for a server action that returns { failed } instead of throwing:
 * a failure shows as a short message under the form, not the error page.
 */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<Result>;
  className?: string;
  children: ReactNode;
}) {
  const [failed, run] = useActionState(async (_prev: string | null, fd: FormData) => {
    try {
      const r = await action(fd);
      return r && typeof r === "object" && "failed" in r ? String((r as { failed: string }).failed) : null;
    } catch {
      return "לא נשמר. בדקו את החיבור ונסו שוב";
    }
  }, null);
  return (
    <form action={run} className={className}>
      <FormFailed.Provider value={!!failed}>{children}</FormFailed.Provider>
      {failed && (
        <p role="alert" className="mt-2 text-sm">
          <span className="hl">{failed}</span>
        </p>
      )}
    </form>
  );
}
