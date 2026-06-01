/**
 * Canonical spellings for acronyms / initialisms common in digital and
 * interaction design. When a competency tag is title-cased, any word that
 * matches one of these (case-insensitively) is replaced with the canonical
 * form here — so "ux designer" -> "UX Designer" and "ixd" -> "IxD".
 *
 * Most are ALL CAPS; a few well-known terms keep brand casing (IxD, GraphQL,
 * SaaS, GenAI, PoC). Add new entries in their canonical form.
 */
export const DESIGN_ACRONYMS: readonly string[] = [
  // Design disciplines & experience
  "UX", "UI", "UXD", "UID", "UXR", "HCI", "IxD", "CX", "EX", "SX", "DX",
  "IA", "CI", "QA", "QC", "UAT", "CRO", "CTA", "DDD", "DesignOps", "DevRel",
  // Reality / spatial / 3D
  "AR", "VR", "XR", "MR", "3D", "2D", "CGI", "VFX", "CAD", "FUI", "GUI", "TUI", "NUI",
  // AI / data
  "AI", "ML", "LLM", "NLP", "GenAI", "OCR", "TTS", "STT", "RAG",
  // Web / engineering
  "HTML", "CSS", "JS", "TS", "JSX", "TSX", "API", "SDK", "CLI", "DOM", "CMS",
  "PWA", "SPA", "SSR", "SSG", "REST", "GraphQL", "SQL", "JSON", "YAML", "XML",
  "HTTP", "HTTPS", "URL", "URI", "CDN", "DNS", "OS", "IoT", "NFC", "GPS", "QR",
  "WASM", "RWD",
  // Media / image / color / motion
  "GIF", "JPG", "JPEG", "PNG", "SVG", "WebP", "PDF", "EPS", "PSD", "RAW",
  "MP3", "MP4", "MOV", "WAV", "RGB", "RGBA", "CMYK", "HSL", "HSB", "HEX",
  "DPI", "PPI", "FPS", "HD", "UHD", "4K", "8K", "HDR", "SDR", "GLB", "glTF",
  // Accessibility / standards / privacy
  "WCAG", "ADA", "ARIA", "A11Y", "i18n", "l10n", "ISO", "RFC", "GDPR",
  // Hardware / display / fabrication
  "LED", "LCD", "OLED", "USB", "RFID", "CNC",
  // Product / business / ops
  "MVP", "PoC", "RFP", "SOW", "NDA", "SLA", "OKR", "KPI", "ROI", "ROAS",
  "CRM", "ERP", "SEO", "SEM", "SaaS", "B2B", "B2C", "D2C", "B2B2C", "P2P", "GTM",
];

const ACRONYM_BY_UPPER = new Map(
  DESIGN_ACRONYMS.map((a) => [a.toUpperCase(), a]),
);

/**
 * Title-cases each word in a competency tag while preserving known acronyms:
 * "game design" -> "Game Design", "ux designer" -> "UX Designer".
 * Words are split on spaces, slashes, and hyphens.
 */
export function titleCaseTag(tag: string): string {
  return tag.replace(/[^\s/-]+/g, (word) => {
    const canonical = ACRONYM_BY_UPPER.get(word.toUpperCase());
    if (canonical) return canonical;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}
