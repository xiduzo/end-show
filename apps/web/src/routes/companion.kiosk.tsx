import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CompanionView } from "@/components/companion-view";

const search = z.object({ code: z.string().optional() });

export const Route = createFileRoute("/companion/kiosk")({
  component: CompanionKioskRoute,
  validateSearch: search,
});

function CompanionKioskRoute() {
  const { code } = Route.useSearch();
  return <CompanionView tier="kiosk" urlCode={code ?? null} />;
}
