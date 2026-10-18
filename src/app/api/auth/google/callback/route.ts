import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { exchangeCode, GOOGLE_COOKIE, publicOrigin, redirectUri } from "@/lib/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  const fail = (code: string) => NextResponse.redirect(`${origin}/login?error=${code}`);

  const jar = await cookies();
  const raw = jar.get(GOOGLE_COOKIE)?.value;
  jar.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });
  if (!raw) return fail("google_expired");
  let saved: { state: string; verifier: string; next: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return fail("google_expired");
  }
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return fail("google_cancelled");
  if (url.searchParams.get("state") !== saved.state) return fail("google_state");

  try {
    const g = await exchangeCode(code, saved.verifier, redirectUri(req));
    if (!g.emailVerified || !g.email) return fail("google_unverified");
    const db = await getDb();
    let [user] = await db.select().from(schema.users).where(eq(schema.users.googleSub, g.sub));
    if (!user) {
      // Link to an existing email/password account with the same verified email.
      [user] = await db.select().from(schema.users).where(eq(schema.users.email, g.email));
      if (user) {
        [user] = await db
          .update(schema.users)
          .set({ googleSub: g.sub, avatarUrl: user.avatarUrl ?? g.picture ?? null })
          .where(eq(schema.users.id, user.id))
          .returning();
      } else {
        [user] = await db
          .insert(schema.users)
          .values({ email: g.email, name: g.name.slice(0, 60), googleSub: g.sub, avatarUrl: g.picture ?? null })
          .returning();
      }
    }
    await createSession({ id: user.id, name: user.name, email: user.email });
    return NextResponse.redirect(`${origin}${saved.next}`);
  } catch (e) {
    console.error("google sign-in failed:", (e as Error).message);
    return fail("google_failed");
  }
}
