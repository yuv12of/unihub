"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** The phone layout scrolls inside #scroller, so a new page has to start at its top. */
export function ScrollReset() {
  const path = usePathname();
  useEffect(() => {
    document.getElementById("scroller")?.scrollTo(0, 0);
  }, [path]);
  return null;
}
