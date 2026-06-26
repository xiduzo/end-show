import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_SERVER_URL: z.url(),
    // Peer budget-request ("I need more →") UI. Defaults OFF so an unset
    // build-arg can never silently re-enable it; set "true" to bring it back.
    VITE_ALLOW_BUDGET_REQUESTS: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  },
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true,
});
