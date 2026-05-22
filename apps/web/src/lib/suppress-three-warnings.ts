const NOISE_PATTERNS = [
  "THREE.WebGLProgram: Program Info Log",
  "Output of vertex shader",
  "not read by fragment shader",
  "THREE.Clock: This module has been deprecated",
];

function isNoise(args: unknown[]): boolean {
  return args.some(
    (a) => typeof a === "string" && NOISE_PATTERNS.some((p) => a.includes(p)),
  );
}

const origWarn = console.warn;
const origLog = console.log;

console.warn = (...args: unknown[]) => {
  if (isNoise(args)) return;
  origWarn(...args);
};

console.log = (...args: unknown[]) => {
  if (isNoise(args)) return;
  origLog(...args);
};
