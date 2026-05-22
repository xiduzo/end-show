import type { StudentSummary } from "@end-show/api/routers/student";

import { ScaledStageCard } from "../scaled-stage-card";
import type { CardEditorDraft, CardEditorProfile } from "./types";

export function StagePreview({
  draft,
  profile,
  flushSave,
}: {
  draft: CardEditorDraft;
  profile: CardEditorProfile;
  flushSave: () => Promise<void>;
}) {
  const previewStudent: StudentSummary = {
    userId: profile.userId,
    displayName: draft.displayName,
    pronouns: draft.pronouns,
    introduction: draft.introduction,
    link: draft.link,
    stageColor: draft.stageColor,
    portraitUrl: profile.portraitUrl,
    workMediaUrl: profile.workMediaUrl,
    workMediaKind: profile.workMediaKind,
    competencies: draft.competencies,
  };

  const openFullscreen = async () => {
    await flushSave();
    window.open(`/stage-preview/${profile.userId}`, "_blank", "noopener");
  };

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="font-mono text-[10px] tracking-widest text-lego-dark/60 uppercase">
          stage preview
        </p>
        <button
          type="button"
          onClick={openFullscreen}
          className="font-mono text-[10px] tracking-widest text-lego-dark/60 uppercase hover:text-slide"
        >
          full screen preview ↗
        </button>
      </div>
      <div className="relative aspect-video overflow-hidden">
        <ScaledStageCard
          student={previewStudent}
          className="absolute inset-0"
        />
      </div>
    </div>
  );
}
