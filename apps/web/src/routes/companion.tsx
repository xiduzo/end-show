import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { CompanionView } from "@/features/companion";

const search = z.object({
  code: z.string().optional(),
  tracks: z.string().optional(),
});

export const Route = createFileRoute("/companion")({
  component: CompanionRoute,
  validateSearch: search,
});

function detectTier(): "mobile" | "kiosk" {
  if (typeof window === "undefined") return "mobile";
  return window.matchMedia("(min-width: 768px)").matches ? "kiosk" : "mobile";
}

function CompanionRoute() {
  const [tier, setTier] = useState<"mobile" | "kiosk">(detectTier);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setTier(mq.matches ? "kiosk" : "mobile");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return <CompanionView tier={tier} />;
}
