import type { StageColor, Track } from "@end-show/api/routers/student";

export type CardEditorProfile = {
  userId: string;
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  competencies: string[];
  stageColor: StageColor | null;
  track: Track;
  portraitUrl: string | null;
  workMediaUrl: string | null;
  workMediaKind: "work-image" | "work-video" | null;
  name?: string;
  email?: string;
};

export type CardEditorDraft = {
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  competencies: string[];
  stageColor: StageColor | null;
  track: Track;
};

export const ONE_LINER_MAX = 80;
export const COMP_MAX = 5;
export const COMP_TAG_MAX = 28;

/**
 * Canonical acronym spellings for digital/interaction design. Keep in sync
 * with packages/db/src/competency.ts — duplicated here so the client bundle
 * does not import the server-only db package. The server normalizes on save;
 * this only makes editor chips look right immediately as you type.
 */
const DESIGN_ACRONYMS: readonly string[] = [
  "UX", "UI", "UXD", "UID", "UXR", "HCI", "IxD", "CX", "EX", "SX", "DX",
  "IA", "CI", "QA", "QC", "UAT", "CRO", "CTA", "DDD", "DesignOps", "DevRel",
  "AR", "VR", "XR", "MR", "3D", "2D", "CGI", "VFX", "CAD", "FUI", "GUI", "TUI", "NUI",
  "AI", "ML", "LLM", "NLP", "GenAI", "OCR", "TTS", "STT", "RAG",
  "HTML", "CSS", "JS", "TS", "JSX", "TSX", "API", "SDK", "CLI", "DOM", "CMS",
  "PWA", "SPA", "SSR", "SSG", "REST", "GraphQL", "SQL", "JSON", "YAML", "XML",
  "HTTP", "HTTPS", "URL", "URI", "CDN", "DNS", "OS", "IoT", "NFC", "GPS", "QR",
  "WASM", "RWD",
  "GIF", "JPG", "JPEG", "PNG", "SVG", "WebP", "PDF", "EPS", "PSD", "RAW",
  "MP3", "MP4", "MOV", "WAV", "RGB", "RGBA", "CMYK", "HSL", "HSB", "HEX",
  "DPI", "PPI", "FPS", "HD", "UHD", "4K", "8K", "HDR", "SDR", "GLB", "glTF",
  "WCAG", "ADA", "ARIA", "A11Y", "i18n", "l10n", "ISO", "RFC", "GDPR",
  "LED", "LCD", "OLED", "USB", "RFID", "CNC",
  "MVP", "PoC", "RFP", "SOW", "NDA", "SLA", "OKR", "KPI", "ROI", "ROAS",
  "CRM", "ERP", "SEO", "SEM", "SaaS", "B2B", "B2C", "D2C", "B2B2C", "P2P", "GTM",
];

const ACRONYM_BY_UPPER = new Map(DESIGN_ACRONYMS.map((a) => [a.toUpperCase(), a]));

/**
 * Title-cases each word in a competency tag while preserving known acronyms:
 * "game design" -> "Game Design", "ux designer" -> "UX Designer".
 */
export function titleCaseTag(tag: string): string {
  return tag.replace(/[^\s/-]+/g, (word) => {
    const canonical = ACRONYM_BY_UPPER.get(word.toUpperCase());
    if (canonical) return canonical;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

export const inputCls =
  "w-full rounded-md border border-lego-dark/20 bg-white px-3 py-2 font-mono text-sm text-lego-dark placeholder:text-lego-dark/30 focus:border-lego focus:outline-none";

export function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ago`;
}
