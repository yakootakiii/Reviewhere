"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { GenerateSheet } from "./generate-sheet";
import { GeneratingPanel } from "./generating-panel";
import { ModeBPanel } from "./mode-b-panel";
import { checkModeAAvailability } from "@/lib/firebase/quizzes";
import type { QuizSettings } from "@/lib/generation/types";
import type { QuizSource } from "@/lib/quiz-shared";

type Stage =
  | { name: "idle" }
  | { name: "settings" }
  | { name: "generating"; settings: QuizSettings }
  | { name: "modeB"; settings: QuizSettings };

/**
 * Owns the §5 flow: settings sheet → either Mode A progress or the Mode B
 * copy-paste panel → a saved quiz. Both endings land in the same place, because
 * both wrote the same schema.
 */
export function GenerateFlow({
  document,
  autoStart = false,
  label = "Generate quiz",
}: {
  document: QuizSource;
  autoStart?: boolean;
  label?: string;
}) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(autoStart ? { name: "settings" } : { name: "idle" });
  // null while unknown; the sheet leads with Mode B once we know it can't run.
  const [modeAAvailable, setModeAAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    checkModeAAvailability().then((result) => {
      if (active) setModeAAvailable(result.available);
    });
    return () => {
      active = false;
    };
  }, []);

  const finish = useCallback(
    (quizId: string, questionCount: number, requested?: number) => {
      const shortfall = requested !== undefined && questionCount < requested;
      toast(
        shortfall
          ? `Quiz saved with ${questionCount} of the ${requested} questions you asked for.`
          : `Quiz generated — ${questionCount} questions.`,
        shortfall ? "info" : "success",
      );
      router.push(`/quizzes/${quizId}`);
    },
    [toast, router],
  );

  return (
    <div className="flex flex-col gap-4">
      {stage.name === "idle" && (
        <div>
          <Button onClick={() => setStage({ name: "settings" })}>
            <Sparkles aria-hidden className="size-[18px]" />
            {label}
          </Button>
        </div>
      )}

      {stage.name === "generating" && (
        <GeneratingPanel
          document={document}
          settings={stage.settings}
          onDone={(result) => finish(result.quizId, result.questionCount, result.requested)}
          onUsePrompt={() => setStage({ name: "modeB", settings: stage.settings })}
          onCancel={() => setStage({ name: "settings" })}
        />
      )}

      {stage.name === "modeB" && (
        <ModeBPanel
          document={document}
          settings={stage.settings}
          onImported={(result) => finish(result.quizId, result.questionCount)}
          onBack={() => setStage({ name: "settings" })}
        />
      )}

      <GenerateSheet
        open={stage.name === "settings"}
        onClose={() => setStage({ name: "idle" })}
        document={document}
        preferences={profile?.preferences}
        modeAAvailable={modeAAvailable !== false}
        onGenerate={(settings) => setStage({ name: "generating", settings })}
        onUsePrompt={(settings) => setStage({ name: "modeB", settings })}
      />
    </div>
  );
}
