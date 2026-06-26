import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 3001,
    host: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "end-show",
        short_name: "end-show",
        description: "end-show - PWA Application",
        theme_color: "#0c0c0c",
        start_url: "/companion",
        scope: "/",
        display: "standalone",
      },
      pwaAssets: { disabled: false, config: true },
      devOptions: { enabled: false },
      workbox: {
        navigateFallbackDenylist: [/^\/trpc/],
        runtimeCaching: [
          {
            // Skip loopback: when the kiosk runs behind the local nginx asset
            // cache (?proxy=http://localhost:…), nginx IS the cache. Letting the
            // SW also CacheFirst those 150MB files would refill the browser quota
            // the proxy exists to escape. Phones/admin (R2 host) still cache here.
            urlPattern: ({ request, url }) =>
              request.destination === "image" &&
              url.hostname !== "localhost" &&
              url.hostname !== "127.0.0.1",
            handler: "CacheFirst",
            options: {
              cacheName: "student-images-v2",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ request, url }) =>
              url.hostname !== "localhost" &&
              url.hostname !== "127.0.0.1" &&
              (request.destination === "video" ||
                /\.(mp4|webm|mov|m4v)$/i.test(url.pathname)),
            handler: "CacheFirst",
            options: {
              cacheName: "student-videos-v2",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
});
