import { Button } from "@end-show/ui/components/button";
import { Input } from "@end-show/ui/components/input";
import { Label } from "@end-show/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BudgetTransferDialog } from "@/components/budget-transfer-dialog";
import { UploadWidget } from "@/components/upload-widget";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/profile")({
  component: ProfileRoute,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
});

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function ProfileRoute() {
  const qc = useQueryClient();
  const profile = useQuery(trpc.student.getMyProfile.queryOptions());
  const budget = useQuery(trpc.asset.getBudget.queryOptions());
  const transfers = useQuery(trpc.budget.myTransfers.queryOptions());
  const upsert = useMutation(trpc.student.upsertProfile.mutationOptions());
  const setPublished = useMutation(trpc.student.setPublished.mutationOptions());
  const [transferOpen, setTransferOpen] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [link, setLink] = useState("");
  const [compInput, setCompInput] = useState("");
  const [competencies, setCompetencies] = useState<string[]>([]);

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.displayName);
    setPronouns(profile.data.pronouns);
    setIntroduction(profile.data.introduction);
    setLink(profile.data.link);
    setCompetencies(profile.data.competencies);
  }, [profile.data]);

  const addComp = () => {
    const t = compInput.trim();
    if (!t || competencies.includes(t) || competencies.length >= 8) return;
    setCompetencies([...competencies, t]);
    setCompInput("");
  };

  const removeComp = (t: string) =>
    setCompetencies(competencies.filter((c) => c !== t));

  const onSave = async () => {
    try {
      await upsert.mutateAsync({
        displayName,
        pronouns,
        introduction,
        link,
        competencies,
      });
      toast.success("Profile saved");
      await qc.invalidateQueries({ queryKey: trpc.student.getMyProfile.queryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const onTogglePublish = async () => {
    const next = !(profile.data?.isPublished ?? false);
    try {
      await setPublished.mutateAsync({ isPublished: next });
      toast.success(next ? "Published" : "Unpublished");
      await qc.invalidateQueries({ queryKey: trpc.student.getMyProfile.queryKey() });
      await qc.invalidateQueries({ queryKey: trpc.student.listEligible.queryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  if (profile.isLoading) {
    return <div className="container mx-auto max-w-2xl px-4 py-6">Loading…</div>;
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Profile</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            profile.data?.isPublished
              ? "bg-green-100 text-green-700"
              : "bg-zinc-100 text-zinc-700"
          }`}
        >
          {profile.data?.isPublished ? "published" : "draft"}
        </span>
      </div>

      {budget.data && (
        <div className="mt-4 rounded-lg border p-3 text-xs">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">Storage</span>
            <span className="text-muted-foreground">
              {formatBytes(budget.data.usedBytes)} /{" "}
              {formatBytes(budget.data.effectiveBudgetBytes)}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full ${
                budget.data.remainingBytes < 0.1 * budget.data.effectiveBudgetBytes
                  ? "bg-red-500"
                  : "bg-zinc-500"
              }`}
              style={{
                width: `${Math.min(
                  100,
                  (budget.data.usedBytes / Math.max(1, budget.data.effectiveBudgetBytes)) *
                    100,
                )}%`,
              }}
            />
          </div>
          {budget.data.transferredInBytes > 0 ||
          budget.data.transferredOutBytes > 0 ? (
            <p className="mt-1 text-muted-foreground">
              transfers: +{formatBytes(budget.data.transferredInBytes)} / −
              {formatBytes(budget.data.transferredOutBytes)}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              className="text-xs text-blue-600 hover:underline"
            >
              Gift storage to a classmate
            </button>
          </div>
          {transfers.data && transfers.data.length > 0 && (
            <ul className="mt-2 space-y-1 border-t pt-2 text-muted-foreground">
              {transfers.data.slice(0, 5).map((t) => (
                <li key={t.id} className="flex justify-between">
                  <span>
                    {t.direction === "out" ? "→" : "←"}{" "}
                    {t.counterparty?.name ?? "unknown"}
                  </span>
                  <span>{formatBytes(t.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {transferOpen && (
        <BudgetTransferDialog onClose={() => setTransferOpen(false)} />
      )}

      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pronouns">Pronouns</Label>
          <Input
            id="pronouns"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            placeholder="she/her"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="introduction">Introduction</Label>
          <textarea
            id="introduction"
            value={introduction}
            onChange={(e) => setIntroduction(e.target.value)}
            className="w-full rounded-md border bg-transparent p-2 text-sm"
            rows={3}
            maxLength={500}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="link">Link</Label>
          <Input
            id="link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://"
          />
        </div>

        <UploadWidget
          kind="portrait"
          label="Portrait"
          currentUrl={profile.data?.portraitUrl ?? null}
          onUploaded={() => {
            qc.invalidateQueries({ queryKey: trpc.student.getMyProfile.queryKey() });
            qc.invalidateQueries({ queryKey: trpc.asset.getBudget.queryKey() });
          }}
        />

        <UploadWidget
          kind="work-image"
          label="Work media (image)"
          currentUrl={
            profile.data?.workMediaKind === "work-image"
              ? (profile.data.workMediaUrl ?? null)
              : null
          }
          onUploaded={() => {
            qc.invalidateQueries({ queryKey: trpc.student.getMyProfile.queryKey() });
            qc.invalidateQueries({ queryKey: trpc.asset.getBudget.queryKey() });
          }}
        />

        <UploadWidget
          kind="work-video"
          label="Work media (video)"
          currentUrl={
            profile.data?.workMediaKind === "work-video"
              ? (profile.data.workMediaUrl ?? null)
              : null
          }
          onUploaded={() => {
            qc.invalidateQueries({ queryKey: trpc.student.getMyProfile.queryKey() });
            qc.invalidateQueries({ queryKey: trpc.asset.getBudget.queryKey() });
          }}
        />

        <div className="space-y-2">
          <Label>Competencies (1–8)</Label>
          <div className="flex gap-2">
            <Input
              value={compInput}
              onChange={(e) => setCompInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addComp();
                }
              }}
              placeholder="UX Designer"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addComp}
              disabled={competencies.length >= 8}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {competencies.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => removeComp(c)}
                className="rounded-full border px-3 py-1 text-xs hover:line-through"
              >
                {c} ×
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={onSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={onTogglePublish}
            disabled={setPublished.isPending || !profile.data}
          >
            {profile.data?.isPublished ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
