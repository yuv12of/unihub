import { Fragment } from "react";
import { mathRuns } from "@/lib/mathRuns";

function Line({ text }: { text: string }) {
  return (
    <>
      {mathRuns(text).map((r, i) =>
        r.math ? (
          <bdi key={i} dir="ltr" className="math-run">
            {r.text}
          </bdi>
        ) : (
          <Fragment key={i}>{r.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Hebrew text with plain-text math inside (like "הקבוצה {(1,0),(0,1)} היא בסיס של R^2."). Math runs
 * are isolated left-to-right, so their order, brackets and signs survive in a right-to-left
 * paragraph (rules in lib/mathRuns). Text with several lines is laid out line by line, each one
 * right-to-left, so a line that starts with a formula never flips the Hebrew after it.
 */
export function MathText({ text }: { text: string }) {
  if (!text.includes("\n")) return <Line text={text} />;
  return (
    <>
      {text.split("\n").map((l, i) =>
        l.trim() ? (
          <span key={i} className="block" dir="rtl">
            <Line text={l} />
          </span>
        ) : (
          <span key={i} className="block h-[1em]" aria-hidden />
        ),
      )}
    </>
  );
}
