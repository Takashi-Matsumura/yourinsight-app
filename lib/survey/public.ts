import type { QuestionKind, Reflection, ReflectionFeedback } from "@/lib/types";

export interface PublicQuestion {
  id: string;
  index: number;
  lead: string;
  text: string;
  kind: QuestionKind;
  options: string[];
}

export interface Light {
  label: string;
  satisfied: boolean;
}

export interface QuestionPayload {
  question: PublicQuestion;
  lights: Light[];
  remaining: number;
  answered: number;
}

export interface PublicAnsweredQuestion {
  question: PublicQuestion;
  value: string;
  freeText: string | null;
}

export interface HistoryPayload {
  items: PublicAnsweredQuestion[];
}

export interface RunnerInitial {
  surveyId: string;
  sessionId: string;
  title: string;
  status: "in_progress" | "completed";
  pending: PublicQuestion | null;
  lights: Light[];
  remaining: number;
  answered: number;
  reflection: Reflection | null;
  feedback: ReflectionFeedback | null;
  ctaText: string;
}

export const ESCAPE_OPTION = "どれでもない";

/** Upper bound for a visitor badge id scanned on the intro screen (sessions.external_id). */
export const EXTERNAL_ID_MAX = 256;
