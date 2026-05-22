import { db } from "@end-show/db";
import { user } from "@end-show/db/schema/auth";
import { student, studentCompetency } from "@end-show/db/schema/student";
import { eq } from "drizzle-orm";

type Seed = {
  id: string;
  name: string;
  email: string;
  pronouns: string;
  intro: string;
  link: string;
  tags: string[];
  stageColor: "slime" | "crayon" | "bubblegum" | null;
};

const STAGE_COLOR_CYCLE: Array<"slime" | "crayon" | "bubblegum" | null> = [
  "slime",
  "crayon",
  "bubblegum",
  null,
  "slime",
  null,
  "crayon",
  "bubblegum",
];

const SEED_NAMES: Array<[string, string]> = [
  ["Alice", "Andersen"],
  ["Bilal", "Bakker"],
  ["Cleo", "Chen"],
  ["Dara", "Demir"],
  ["Esa", "Eriksen"],
  ["Faye", "Fischer"],
  ["Gus", "Garcia"],
  ["Hana", "Hassan"],
  ["Iggy", "Ibrahim"],
  ["Juno", "Jansen"],
  ["Kai", "Kowalski"],
  ["Lior", "Lefevre"],
  ["Mira", "Moreau"],
  ["Niko", "Novak"],
  ["Omar", "Olsen"],
  ["Pia", "Park"],
  ["Quinn", "Qureshi"],
  ["Remi", "Rossi"],
  ["Sasha", "Singh"],
  ["Tess", "Tanaka"],
  ["Uma", "Ueda"],
  ["Vik", "Vasquez"],
  ["Wren", "Weber"],
  ["Xan", "Xu"],
  ["Yara", "Yilmaz"],
  ["Zev", "Zhou"],
  ["Anu", "Adebayo"],
  ["Bo", "Brandt"],
  ["Cory", "Castro"],
  ["Dee", "Dubois"],
  ["Eli", "Esposito"],
  ["Finn", "Fontaine"],
  ["Gia", "Gomes"],
  ["Hugo", "Holm"],
  ["Ines", "Iverson"],
  ["Jad", "Joshi"],
  ["Kit", "Khan"],
  ["Luca", "Larsen"],
  ["Mae", "Mendes"],
  ["Nia", "Nakamura"],
  ["Otto", "Ozturk"],
  ["Pavi", "Petrov"],
  ["Roo", "Rahimi"],
  ["Sol", "Schmidt"],
  ["Tomi", "Toledo"],
  ["Uri", "Ueno"],
  ["Vera", "Visser"],
  ["Will", "Wagner"],
  ["Yuki", "Yamada"],
  ["Zoe", "Zarate"],
];

const PRONOUNS = ["she/her", "he/him", "they/them"];
const TAG_POOL = [
  "UX Designer",
  "Researcher",
  "Developer",
  "Tool-maker",
  "Type Designer",
  "Motion",
  "Illustrator",
  "Printmaker",
  "Photographer",
  "3D Artist",
  "Sound Designer",
  "Game Designer",
  "Service Designer",
  "Writer",
  "Filmmaker",
  "Ceramicist",
  "Textile",
  "Animator",
  "Speculative",
  "Critical Design",
  "Brand",
  "Editorial",
  "Generative",
  "AR/VR",
  "Hardware",
];
const INTROS = [
  "Designer focused on speculative interaction and the small frictions of daily tools.",
  "Builds tools at the seam of code and craft, where prototypes become quiet arguments.",
  "Works across type, motion, and systems to give shape to ideas that resist easy form.",
  "Researcher chasing the edges of attention through interfaces that listen as they speak.",
  "Storyteller through interface and ink, stitching narrative into the seams of software.",
  "Mixes analog process with digital output to keep the hand visible inside the machine.",
  "Plays with rules until they break nicely, then rebuilds them into kinder, stranger forms.",
  "Quietly obsessed with grids, friction, and the rhythm of things that almost line up well.",
  "Makes images that argue with themselves about what a picture is allowed to be saying now.",
  "Designs for hands as much as eyes, treating every screen as a surface worth touching back.",
];

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

const STUDENTS: Seed[] = SEED_NAMES.map(([first, last], i) => {
  const id = `seed-${slug(first)}-${slug(last)}`;
  const count = 4 + (i % 2);
  const tags: string[] = [];
  let k = 0;
  while (tags.length < count && k < TAG_POOL.length * 2) {
    const tag = TAG_POOL[(i * 7 + k * 3 + 3) % TAG_POOL.length]!;
    if (!tags.includes(tag)) tags.push(tag);
    k++;
  }
  return {
    id,
    name: `${first} ${last}`,
    email: `${slug(first)}.${slug(last)}@seed.local`,
    pronouns: PRONOUNS[i % PRONOUNS.length]!,
    intro: INTROS[i % INTROS.length]!,
    link: `https://example.com/${slug(first)}-${slug(last)}`,
    tags,
    stageColor: STAGE_COLOR_CYCLE[i % STAGE_COLOR_CYCLE.length]!,
  };
});

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
        stageColor: s.stageColor,
      })
      .onConflictDoUpdate({
        target: student.userId,
        set: {
          displayName: s.name,
          pronouns: s.pronouns,
          introduction: s.intro,
          link: s.link,
          stageColor: s.stageColor,
        },
      });
    await db.delete(studentCompetency).where(eq(studentCompetency.studentUserId, s.id));
    for (const t of s.tags) {
      await db
        .insert(studentCompetency)
        .values({ studentUserId: s.id, tag: t })
        .onConflictDoNothing();
    }
  }
}
