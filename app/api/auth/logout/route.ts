import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { signOut } from "@/lib/auth";
import { sessionCookieName } from "@/lib/auth-config";

export async function POST() {
  await signOut();
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires: new Date(0)
  });
  return NextResponse.json({ ok: true });
}
