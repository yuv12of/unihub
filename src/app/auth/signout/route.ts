import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";

export async function POST(request: NextRequest) {
  if (supabaseEnabled) await (await createClient()).auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
