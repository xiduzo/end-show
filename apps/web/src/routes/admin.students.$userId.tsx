import { Button } from "@end-show/ui/components/button";
import { Input } from "@end-show/ui/components/input";
import { Label } from "@end-show/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/admin/students/$userId")({
  component: AdminStudentEdit,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login" });
    const role = (session.data.user as { role?: string }).role;
    if (role !== "staff") throw redirect({ to: "/dashboard" });
    return { session };
  },
});

function AdminStudentEdit() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const data = useQuery(trpc.admin.getStudent.queryOptions({ userId }));
  const upsert = useMutation(trpc.admin.upsertStudent.mutationOptions());
  const setPub = useMutation(trpc.admin.setStudentPublished.mutationOptions());

  const [displayName, setDisplayName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [link, setLink] = useState("");
  const [compInput, setCompInput] = useState("");
  const [competencies, setCompetencies] = useState<string[]>([]);

  useEffect(() => {
    if (!data.data) return;
    setDisplayName(data.data.displayName);
    setPronouns(data.data.pronouns);
    setIntroduction(data.data.introduction);
    setLink(data.data.link);
    setCompetencies(data.data.competencies);
  }, [data.data]);

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
        userId,
        displayName,
        pronouns,
        introduction,
        link,
        competencies,
      });
      toast.success("Saved");
      await qc.invalidateQueries({ queryKey: trpc.admin.getStudent.queryKey({ userId }) });
      await qc.invalidateQueries({ queryKey: trpc.admin.listStudents.queryKey() });
      await qc.invalidateQueries({ queryKey: trpc.student.listEligible.queryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const onTogglePublish = async () => {
    const next = !(data.data?.isPublished ?? false);
    try {
      await setPub.mutateAsync({ userId, isPublished: next });
      toast.success(next ? "Published" : "Unpublished");
      await qc.invalidateQueries({ queryKey: trpc.admin.getStudent.queryKey({ userId }) });
      await qc.invalidateQueries({ queryKey: trpc.student.listEligible.queryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  if (data.isLoading) {
    return <div className="container mx-auto max-w-2xl px-4 py-6">Loading…</div>;
  }
  if (!data.data) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6 text-red-500">
        Student not found.
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Edit · {data.data.name}</h1>
        <button
          type="button"
          onClick={() => navigate({ to: "/admin/students" })}
          className="text-sm text-blue-600 hover:underline"
        >
          ← all students
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{data.data.email}</p>

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

        {(data.data.portraitUrl || data.data.workMediaUrl) && (
          <div className="grid grid-cols-2 gap-4">
            {data.data.portraitUrl && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Portrait</p>
                <img
                  src={data.data.portraitUrl}
                  alt="Portrait"
                  className="max-h-48 rounded-md border object-cover"
                />
              </div>
            )}
            {data.data.workMediaUrl && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Work</p>
                {data.data.workMediaKind === "work-video" ? (
                  <video
                    src={data.data.workMediaUrl}
                    controls
                    className="max-h-48 w-full rounded-md border bg-black"
                  />
                ) : (
                  <img
                    src={data.data.workMediaUrl}
                    alt="Work"
                    className="max-h-48 rounded-md border object-cover"
                  />
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Note: Staff can edit text fields and toggle publish. Media is uploaded by the
          student from their own /profile.
        </p>

        <div className="flex gap-3 pt-2">
          <Button onClick={onSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={onTogglePublish}
            disabled={setPub.isPending}
          >
            {data.data.isPublished ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
