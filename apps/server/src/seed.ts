import { db } from "@end-show/db";
import { asset } from "@end-show/db/schema/asset";
import { user } from "@end-show/db/schema/auth";
import { student, studentCompetency } from "@end-show/db/schema/student";
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

type StageColor = "slime" | "crayon" | "bubblegum";
const STAGE_COLORS: readonly StageColor[] = ["slime", "crayon", "bubblegum"];
const COMPETENCIES = [
  "Product Design",
  "UX Research",
  "Illustration",
  "Animation",
  "Web Dev",
  "Mobile Dev",
  "3D Modeling",
  "Photography",
  "Video Editing",
  "Copywriting",
  "Branding",
  "UI Design",
  "Interaction Design",
  "Data Visualization",
  "Accessibility",
];

const NAMES = [
  "Alex", "Bailey", "Casey", "Dakota", "Ellis", "Finley", "Gray", "Harper",
  "Indigo", "Jordan", "Kale", "Lane", "Morgan", "Nova", "Oliver", "Parker",
  "Quinn", "Riley", "Sam", "Taylor", "Urban", "Vale", "Wesley", "Xavier",
  "Yuki", "Zion", "Addison", "Brooklyn", "Charlie", "Drew", "Emerson",
  "Frankie", "Gauge", "Haven", "Ivory", "January", "Kieran", "Landry",
  "Marley", "North", "Oakland", "Phoenix", "Quest", "River", "Sage",
  "Tatum", "Utah", "Valor", "Waverly", "Xander", "Yale", "Zephyr"
];

const PRONOUNS = ["they/them", "he/him", "she/her", "xe/xem", "ey/em"];

// Each intro ≤ 80 chars. No name interpolation — displayName shows the name.
const INTROS: readonly string[] = [
  "Multidisciplinary maker. Craft meets code.",
  "Playful systems for calmer everyday tools.",
  "Interaction designer chasing the alive moment in a prototype.",
  "Generalist. Ship messy beats polish safe.",
  "Visual storyteller across print, screen, and space.",
  "Software that respects the person on the other side.",
  "Motion, type, code — stitched into things that feel inevitable.",
  "Illustrator turned dev. Draws first, tests later.",
  "Obsessed with mundane infrastructure and its rituals.",
  "Tiny tools for the niche communities I'm in.",
  "Researcher first. I make things to learn.",
  "Slow software, weird interfaces, durable design.",
  "Generative systems as a way to think out loud.",
  "Accessibility is the starting line, not a checklist.",
  "Happiest between a thesis and a toy.",
  "Print kid who fell into the browser and stayed.",
  "Type, grids, and the occasional shader.",
  "Half product designer, half woodworker. Same problem.",
  "Trying to make boring tools quietly delightful.",
  "Designs by day, breaks synths by night.",
  "Animator chasing weight, timing, and bad jokes.",
  "I prototype until the answer is obvious.",
  "Service design for the unglamorous bits of public life.",
  "Building software the way I'd build furniture.",
  "Brand systems for people who hate brand systems.",
  "Reads code like prose, writes prose like code.",
  "Editorial mind, engineering hands.",
  "I make small things, slowly, on purpose.",
  "Curious about everything; finishes most of it.",
  "Designing for attention without stealing it.",
];

function shuffledIndex(i: number, salt: number, len: number): number {
  let h = (i + 1) * 2654435761;
  h ^= salt * 0x9e3779b1;
  h = (h ^ (h >>> 16)) >>> 0;
  return h % len;
}

function buildIntroduction(_name: string, i: number): string {
  return INTROS[shuffledIndex(i, 23, INTROS.length)]!;
}

// Public sample MP4s (Google's gtv-videos-bucket, CORS-open). Cycled per student.
const SAMPLE_VIDEOS: readonly { url: string; durationMs: number; bytes: number }[] = [
  { url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", durationMs: 596_000, bytes: 158_008_374 },
  { url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", durationMs: 653_000, bytes: 169_872_360 },
  { url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", durationMs: 15_000, bytes: 2_299_653 },
  { url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", durationMs: 15_000, bytes: 2_481_134 },
  { url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4", durationMs: 60_000, bytes: 2_623_403 },
  { url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4", durationMs: 15_000, bytes: 2_175_244 },
  { url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4", durationMs: 15_000, bytes: 2_363_286 },
];

export function defaultStageColor(seed: string): StageColor {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return STAGE_COLORS[h % STAGE_COLORS.length]!;
}

export async function seedStudents(): Promise<void> {
  if (env.NODE_ENV !== "development") {
    return;
  }

  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "student"));

  if (existing.length > 0) {
    console.log(`[seed] ${existing.length} students already exist, skipping seed`);
    return;
  }

  const studentCount = 50;
  const usersToInsert = [];
  const studentsToInsert = [];
  const competenciesToInsert = [];
  const assetsToInsert = [];

  console.log(`[seed] generating ${studentCount} students...`);

  for (let i = 0; i < studentCount; i++) {
    const userId = crypto.randomUUID();
    const name = NAMES[i % NAMES.length]!;
    const email = `student${i + 1}@example.com`;
    const pronouns = PRONOUNS[i % PRONOUNS.length]!;
    const displayName = `${name} (Student ${i + 1})`;
    const introduction = buildIntroduction(name, i);
    const link = `https://example.com/portfolio/${name.toLowerCase()}`;
    const stageColor = defaultStageColor(userId);

    // Portrait — randomuser.me serves real-person stock photos at stable
    // deterministic URLs (men|women / 0..99). 200 unique faces total.
    const portraitAssetId = crypto.randomUUID();
    const gender = i % 2 === 0 ? "women" : "men";
    const portraitUrl = `https://randomuser.me/api/portraits/${gender}/${i % 100}.jpg`;

    // Work media — every 3rd student gets video, rest get image.
    // Picsum is Unsplash-backed (real photography, CC0). Seeded for stability.
    const workAssetId = crypto.randomUUID();
    const isVideo = i % 3 === 0;
    const workUrl = isVideo
      ? SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length]!.url
      : `https://picsum.photos/seed/student-work-${i + 1}/1280/960`;

    usersToInsert.push({
      id: userId,
      name,
      email,
      emailVerified: true,
      role: "student" as const,
    });

    studentsToInsert.push({
      userId,
      displayName,
      pronouns,
      introduction,
      link,
      stageColor,
      track: i % 2 === 0 ? ("IxD" as const) : ("DFT" as const),
      portraitAssetId,
      workMediaAssetId: workAssetId,
    });

    const compCount = 2 + Math.floor(Math.random() * 3);
    const selectedComps = new Set<string>();
    while (selectedComps.size < compCount) {
      selectedComps.add(
        COMPETENCIES[Math.floor(Math.random() * COMPETENCIES.length)]!,
      );
    }
    for (const comp of selectedComps) {
      competenciesToInsert.push({ studentUserId: userId, tag: comp });
    }

    assetsToInsert.push({
      id: portraitAssetId,
      studentUserId: userId,
      kind: "portrait" as const,
      // r2Key holds full URL — assetStore.publicUrl() passes http(s) through.
      r2Key: portraitUrl,
      bytes: 50_000,
      mimeType: "image/jpeg",
      width: 512,
      height: 512,
      durationMs: null,
    });

    if (isVideo) {
      const v = SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length]!;
      assetsToInsert.push({
        id: workAssetId,
        studentUserId: userId,
        kind: "work-video" as const,
        // Sample videos are cycled, so the bare URL collides on asset.r2_key's
        // UNIQUE index. Fragment makes it unique per student; server ignores it.
        r2Key: `${v.url}#student-${i}`,
        bytes: v.bytes,
        mimeType: "video/mp4",
        width: 1280,
        height: 720,
        durationMs: v.durationMs,
      });
    } else {
      assetsToInsert.push({
        id: workAssetId,
        studentUserId: userId,
        kind: "work-image" as const,
        r2Key: workUrl,
        bytes: 200_000,
        mimeType: "image/jpeg",
        width: 1280,
        height: 960,
        durationMs: null,
      });
    }
  }

  if (usersToInsert.length > 0) {
    await db.insert(user).values(usersToInsert);
    console.log(`[seed] inserted ${usersToInsert.length} user(s)`);
  }

  if (studentsToInsert.length > 0) {
    await db.insert(student).values(studentsToInsert);
    console.log(`[seed] inserted ${studentsToInsert.length} student(s)`);
  }

  if (assetsToInsert.length > 0) {
    await db.insert(asset).values(assetsToInsert);
    const videos = assetsToInsert.filter((a) => a.kind === "work-video").length;
    const images = assetsToInsert.filter((a) => a.kind === "work-image").length;
    console.log(
      `[seed] inserted ${assetsToInsert.length} asset(s) (${images} work-image, ${videos} work-video)`,
    );
  }

  if (competenciesToInsert.length > 0) {
    await db.insert(studentCompetency).values(competenciesToInsert);
    console.log(`[seed] inserted ${competenciesToInsert.length} competency tags`);
  }

  console.log("[seed] student seed complete");
}
