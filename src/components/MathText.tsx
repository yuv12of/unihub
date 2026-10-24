import { Fragment } from "react";

const HEB = /[֐-׿]/;
const MATHY = /[A-Za-z0-9∑√≤≥∈∉⊆⊂∪∩→←↔∀∃≠±×÷−·⋅^_=+*/<>|{}()[\]∞λαβγδεπσμθφΣΠ-]/;

/**
 * Hebrew text with plain-text math inside (like "הקבוצה {(1,0),(0,1)} היא בסיס של R^2."). Runs of
 * non-Hebrew words that look like math are isolated left-to-right, so brackets and order survive.
 */
export function MathText({ text }: { text: string }) {
  const tokens = text.split(/(\s+)/);
  const out: { math: boolean; s: string }[] = [];
  for (const t of tokens) {
    const isSpace = /^\s+$/.test(t);
    const math = !isSpace && !HEB.test(t) && MATHY.test(t);
    const last = out[out.length - 1];
    if (isSpace) {
      if (last) last.s += t;
      else out.push({ math: false, s: t });
    } else if (last && last.math === math && (math || !last.math)) last.s += t;
    else out.push({ math, s: t });
  }
  return (
    <>
      {out.map((r, i) => {
        if (!r.math) return <Fragment key={i}>{r.s}</Fragment>;
        // keep the sentence's own punctuation and spaces outside the isolated run
        const m = r.s.match(/^([\s\S]*?)([.,:;!?]?)(\s*)$/)!;
        return (
          <Fragment key={i}>
            <bdi dir="ltr">
              {m[1]}
            </bdi>
            {m[2]}
            {m[3]}
          </Fragment>
        );
      })}
    </>
  );
}
