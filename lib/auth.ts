import "server-only";

import { cookies } from "next/headers";

import { AuthSession, createSession, deleteSession, getDemoCredentials, getSession } from "@/lib/db";
import { sessionCookieName } from "@/lib/auth-config";

export async function getCurrentSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  return await getSession(cookieStore.get(sessionCookieName)?.value);
}

export async function signIn(email: string, password: string) {
  return await createSession(email, password);
}

export async function signOut() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  await deleteSession(token);
}

export function getLoginHint() {
  return getDemoCredentials();
}
