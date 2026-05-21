import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CompanionView } from "@/components/companion-view";

const search = z.object({ code: z.string().optional() });

export const Route = createFileRoute("/companion")({
  component: CompanionRoute,
  validateSearch: search,
});

function CompanionRoute() {
  const { code } = Route.useSearch();
  return <CompanionView tier="mobile" urlCode={code ?? null} />;
}
