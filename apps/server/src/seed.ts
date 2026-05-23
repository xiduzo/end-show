import { db } from "@end-show/db";
import { user } from "@end-show/db/schema/auth";
import { env } from "@end-show/env/server";
import { eq } from "drizzle-orm";

export async function seedRootStaff(): Promise<void> {
  const email = env.ROOT_STAFF_EMAIL.toLowerCase();
  const name = env.ROOT_STAFF_NAME;

  const existing = await db.select().from(user).where(eq(user.email, email));
  const current = existing[0];

  if (!current) {
    await db.insert(user).values({
      id: crypto.randomUUID(),
      name,
      email,
      emailVerified: true,
      role: "staff",
    });
    console.log(`[seed] created root staff ${email}`);
    return;
  }

  if (current.role !== "staff") {
    await db.update(user).set({ role: "staff" }).where(eq(user.id, current.id));
    console.log(`[seed] promoted ${email} to staff`);
  }
}
