import type { AppRouter } from "@end-show/api/routers/index";
import { env } from "@end-show/env/web";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import { useWsConnectionStore } from "@/lib/ws-connection";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(error.message, {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
});

const wsUrl = env.VITE_SERVER_URL.replace(/^http/, "ws") + "/trpc";
const wsClient = createWSClient({
  url: wsUrl,
  keepAlive: { enabled: true, intervalMs: 25_000, pongTimeoutMs: 5_000 },
  retryDelayMs: (attempt) => Math.min(30_000, 500 * 2 ** attempt),
  onOpen: () => useWsConnectionStore.getState().setConnected(true),
  onClose: () => useWsConnectionStore.getState().setConnected(false),
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({
        url: `${env.VITE_SERVER_URL}/trpc`,
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
