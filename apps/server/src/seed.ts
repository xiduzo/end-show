import { db } from "@end-show/db";
import { user } from "@end-show/db/schema/auth";
import { student, studentCompetency } from "@end-show/db/schema/student";

type Seed = {
  id: string;
  name: string;
  email: string;
  pronouns: string;
  intro: string;
  link: string;
  tags: string[];
};

const STUDENTS: Seed[] = [
  {
    id: "seed-alice",
    name: "Alice Andersen",
    email: "alice@seed.local",
    pronouns: "she/her",
    intro: "Designer focused on speculative interaction.",
    link: "https://example.com/alice",
    tags: ["UX Designer", "Researcher"],
  },
  {
    id: "seed-bilal",
    name: "Bilal Bakker",
    email: "bilal@seed.local",
    pronouns: "he/him",
    intro: "Builds tools at the seam of code and craft.",
    link: "https://example.com/bilal",
    tags: ["Developer", "Tool-maker"],
  },
  {
    id: "seed-cleo",
    name: "Cleo Chen",
    email: "cleo@seed.local",
    pronouns: "they/them",
    intro: "Type, motion, systems.",
    link: "https://example.com/cleo",
    tags: ["Type Designer", "Motion"],
  },
];

const STAFF: { id: string; name: string; email: string } = {
  id: "seed-staff",
  name: "Show Staff",
  email: "staff@end-show.local",
};

export async function seedStudents(): Promise<void> {
  await db
    .insert(user)
    .values({
      id: STAFF.id,
      name: STAFF.name,
      email: STAFF.email,
      emailVerified: true,
      role: "staff",
    })
    .onConflictDoNothing();

  for (const s of STUDENTS) {
    await db
      .insert(user)
      .values({
        id: s.id,
        name: s.name,
        email: s.email,
        emailVerified: true,
        role: "student",
      })
      .onConflictDoNothing();
    await db
      .insert(student)
      .values({
        userId: s.id,
        displayName: s.name,
        pronouns: s.pronouns,
        introduction: s.intro,
        link: s.link,
        isPublished: true,
      })
      .onConflictDoNothing();
    for (const t of s.tags) {
      await db
        .insert(studentCompetency)
        .values({ studentUserId: s.id, tag: t })
        .onConflictDoNothing();
    }
  }
}
