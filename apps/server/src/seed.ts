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
  "Designer focused on speculative interaction.",
  "Builds tools at the seam of code and craft.",
  "Type, motion, systems.",
  "Researcher chasing edges of attention.",
  "Storyteller through interface and ink.",
  "Mixing analog process with digital output.",
  "Plays with rules until they break nicely.",
  "Quietly obsessed with grids and friction.",
  "Makes images that argue with themselves.",
  "Designs for hands as much as eyes.",
];

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

const STUDENTS: Seed[] = SEED_NAMES.map(([first, last], i) => {
  const id = `seed-${slug(first)}-${slug(last)}`;
  const tagA = TAG_POOL[i % TAG_POOL.length]!;
  const tagB = TAG_POOL[(i * 7 + 3) % TAG_POOL.length]!;
  return {
    id,
    name: `${first} ${last}`,
    email: `${slug(first)}.${slug(last)}@seed.local`,
    pronouns: PRONOUNS[i % PRONOUNS.length]!,
    intro: INTROS[i % INTROS.length]!,
    link: `https://example.com/${slug(first)}-${slug(last)}`,
    tags: tagA === tagB ? [tagA] : [tagA, tagB],
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
