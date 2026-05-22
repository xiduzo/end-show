import { cn } from "@end-show/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAssetUpload } from "@/features/assets";
import { TopBar } from "@/shell";
import { trpc } from "@/lib/trpc";

import { CompetenciesSection } from "./competencies-section";
import { Field } from "./field";
import { OneLinerMeter } from "./one-liner-meter";
import { PortraitColumn } from "./portrait-column";
import { ShowcaseColumn } from "./showcase-column";
import { StageColorPicker } from "./stage-color-picker";
import { StagePreview } from "./stage-preview";
import {
  COMP_MAX,
  inputCls,
  ONE_LINER_MAX,
  timeAgo,
  type CardEditorDraft,
  type CardEditorProfile,
} from "./types";

export type { CardEditorDraft, CardEditorProfile } from "./types";

type Props = {
  mode: "self" | "staff";
  profile: CardEditorProfile;
  onSave: (draft: CardEditorDraft) => Promise<void>;
  onAssetChanged: () => void;
  budgetSlot?: React.ReactNode;
};

export function CardEditor({
  mode,
  profile,
  onSave,
  onAssetChanged,
  budgetSlot,
}: Props) {
  const qc = useQueryClient();
  const cohort = useQuery(
    trpc.student.cohortTags.queryOptions(
      mode === "staff" ? { excludeUserId: profile.userId } : undefined,
    ),
  );

  const [draft, setDraft] = useState<CardEditorDraft>({
    displayName: profile.displayName,
    pronouns: profile.pronouns,
    introduction: profile.introduction.slice(0, ONE_LINER_MAX),
    link: profile.link,
    competencies: profile.competencies.slice(0, COMP_MAX),
    stageColor: profile.stageColor,
  });
  const lastSyncedUserId = useRef(profile.userId);
  useEffect(() => {
    if (lastSyncedUserId.current !== profile.userId) {
      lastSyncedUserId.current = profile.userId;
      setDraft({
        displayName: profile.displayName,
        pronouns: profile.pronouns,
        introduction: profile.introduction.slice(0, ONE_LINER_MAX),
        link: profile.link,
        competencies: profile.competencies.slice(0, COMP_MAX),
        stageColor: profile.stageColor,
      });
    }
  }, [profile]);

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const inFlightDraft = useRef<CardEditorDraft | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const scheduleSave = (next: CardEditorDraft) => {
    dirtyRef.current = true;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      doSave(next);
    }, 600);
  };

  const doSave = async (next: CardEditorDraft) => {
    if (inFlightDraft.current) {
      saveTimer.current = window.setTimeout(() => doSave(next), 400);
      return;
    }
    inFlightDraft.current = next;
    setSaving(true);
    try {
      await onSave(next);
      setSavedAt(Date.now());
      dirtyRef.current = false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
      inFlightDraft.current = null;
    }
  };

  const flushSave = async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirtyRef.current) await doSave(draft);
    while (inFlightDraft.current) {
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  const update = <K extends keyof CardEditorDraft>(
    key: K,
    value: CardEditorDraft[K],
  ) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      scheduleSave(next);
      return next;
    });
  };

  const upload = useAssetUpload({
    onUploaded: () => {
      onAssetChanged();
      qc.invalidateQueries({
        queryKey: trpc.student.getMyProfile.queryKey(),
      });
    },
  });

  const isComplete =
    draft.displayName.trim() !== "" &&
    draft.pronouns.trim() !== "" &&
    draft.introduction.trim() !== "" &&
    draft.link.trim() !== "" &&
    profile.portraitUrl !== null &&
    profile.workMediaUrl !== null &&
    draft.competencies.length > 0 &&
    draft.stageColor !== null;

  const isNew =
    !profile.displayName &&
    !profile.introduction &&
    !profile.competencies.length;

  const statusText = saving
    ? "saving…"
    : isNew && !savedAt
      ? "new profile"
      : isComplete
        ? "complete"
        : "incomplete";

  const savedText = savedAt ? `saved ${timeAgo(savedAt)}` : null;

  return (
    <div className="min-h-screen bg-chalkboard text-lego-dark">
      <input
        ref={upload.inputRef}
        type="file"
        className="hidden"
        onChange={upload.onFile}
      />
      <TopBar
        crumbs={
          mode === "self"
            ? [{ label: "my profile" }, { label: "edit card" }]
            : [
                { label: "admin" },
                { label: "students", href: "/admin/students" },
                {
                  label:
                    profile.name ||
                    profile.displayName ||
                    profile.email ||
                    "student",
                },
              ]
        }
      />

      {budgetSlot}

      <div className="mx-auto max-w-6xl px-8 pt-10 pb-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <h1 className="font-display text-5xl font-bold tracking-tight">
            {isNew ? "Set up your card" : "Edit your card"}
            <span className="text-slide">.</span>
          </h1>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-xs font-bold tracking-widest uppercase",
                isComplete
                  ? "bg-slime text-lego-dark"
                  : "border-2 border-dashed border-slide text-slide",
              )}
            >
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  isComplete ? "bg-lego-dark" : "animate-pulse bg-slide",
                )}
              />
              {statusText}
            </span>
            {savedText && (
              <span className="font-mono text-[10px] text-lego-dark/40">
                {savedText}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl border-t border-dashed border-lego-dark/15 px-8 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr_1fr]">
          <PortraitColumn
            portraitUrl={profile.portraitUrl}
            busy={upload.busy && upload.activeKind === "portrait"}
            progress={upload.progress}
            onPick={() => upload.pickFile("portrait")}
            readOnly={mode === "staff"}
          />

          <div className="space-y-5">
            <Field label="Display name" required>
              <input
                value={draft.displayName}
                onChange={(e) => update("displayName", e.target.value)}
                placeholder="first last"
                maxLength={80}
                className={inputCls}
              />
            </Field>
            <Field label="Pronouns" required>
              <input
                value={draft.pronouns}
                onChange={(e) =>
                  update("pronouns", e.target.value.toUpperCase())
                }
                placeholder="THEY/THEM"
                maxLength={40}
                className={inputCls}
              />
            </Field>
            <Field
              label="One-liner"
              required
              hint={`${ONE_LINER_MAX} chars · shown under your name on stage`}
            >
              <textarea
                value={draft.introduction}
                onChange={(e) =>
                  update("introduction", e.target.value.slice(0, ONE_LINER_MAX))
                }
                placeholder="what's the one thing you want people to walk away knowing?"
                rows={3}
                className={cn(inputCls, "resize-none leading-snug")}
              />
              <OneLinerMeter value={draft.introduction} />
            </Field>
            <Field label="Portfolio link" hint="Optional">
              <div className="flex flex-col items-center gap-2">
                <input
                  value={draft.link}
                  onChange={(e) => update("link", e.target.value)}
                  placeholder="yoursite.studio/mdd"
                  maxLength={300}
                  className={cn(inputCls, "flex-1")}
                />
              </div>
            </Field>
          </div>

          <div className="space-y-5">
            <ShowcaseColumn
              workMediaUrl={profile.workMediaUrl}
              workMediaKind={profile.workMediaKind}
              busy={
                upload.busy &&
                (upload.activeKind === "work-image" ||
                  upload.activeKind === "work-video")
              }
              progress={upload.progress}
              onPick={() => upload.pickFile(["work-image", "work-video"])}
              onPickVideo={() => upload.pickFile("work-video")}
              readOnly={mode === "staff"}
            />
            <Field label="Stage color" required hint="your backdrop on stage">
              <StageColorPicker
                value={draft.stageColor}
                onChange={(c) => update("stageColor", c)}
              />
            </Field>
          </div>
        </div>
      </div>

      <CompetenciesSection
        competencies={draft.competencies}
        cohort={cohort.data ?? []}
        onChange={(next) => update("competencies", next)}
      />

      <div className="mx-auto max-w-6xl border-t border-dashed border-lego-dark/15 px-8 py-8">
        <StagePreview draft={draft} profile={profile} flushSave={flushSave} />
      </div>
    </div>
  );
}
