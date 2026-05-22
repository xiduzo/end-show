const port = Number(process.env.PORT ?? 80);
const distDir = new URL("./dist/", import.meta.url);

function resolve(pathname: string): URL {
  const clean = pathname.replace(/^\/+/, "");
  return new URL(clean || "index.html", distDir);
}

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const file = Bun.file(resolve(url.pathname));
    if (await file.exists()) return new Response(file);
    return new Response(Bun.file(new URL("./index.html", distDir)));
  },
});

console.log(`web static server on :${port}`);
