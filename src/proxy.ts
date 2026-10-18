import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnabled, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

const PUBLIC_PATHS = ["/login", "/privacy", "/terms", "/auth", "/family", "/api/calendar", "/api/ingest", "/api/digest", "/api/push/tick", "/api/sync", "/api/weekly", "/api/books"];

/**
 * Refreshes the Supabase session and keeps the app private: anyone can sign in with Google,
 * but only accounts the admin approved get past the "waiting for approval" page.
 */
export async function proxy(request: NextRequest) {
  if (!supabaseEnabled) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined)?.toLowerCase();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!isPublic && !email) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (!isPublic && email) {
    const { data: profile } = await supabase.from("profiles").select("status").maybeSingle();
    const approved = profile?.status === "approved";
    if (!approved && path !== "/pending") {
      const url = request.nextUrl.clone();
      url.pathname = "/pending";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (approved && path === "/pending") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|apple-touch-icon.png|icon-.*\\.png|manifest.webmanifest|pdf\\.worker\\.min\\.mjs|pdfjs/).*)"],
};
