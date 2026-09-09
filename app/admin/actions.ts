"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createSurvey,
  deleteSurvey,
  getSurvey,
  listTopics,
  replaceTopics,
  setSeedQuestions,
  setSurveyStatus,
  updateSurvey,
  type TopicInput,
} from "@/lib/repo/surveys";
import { saveLlmSettings } from "@/lib/repo/settings";
import {
  createSolution,
  deleteSolution,
  updateSolution,
  setSurveySolutions,
  type SolutionInput,
} from "@/lib/repo/solutions";
import type {
  GeneratedQuestion,
  LlmSettings,
  QuestionKind,
  Solution,
  SurveyStatus,
  SurveyViewpoint,
} from "@/lib/types";

function toViewpoint(v: FormDataEntryValue | string | null | undefined): SurveyViewpoint {
  return v === "organization" ? "organization" : "individual";
}

export interface DesignDraft {
  purpose: string;
  audience: string;
  viewpoint: SurveyViewpoint;
  title: string;
  intro_text: string;
  solution_ids: string[];
  topics: {
    label: string;
    description: string;
    priority: number;
    target_solution_id: string | null;
    fallback_question: { text: string; kind: QuestionKind; options: string[] };
  }[];
}

export async function createSurveyFromDesign(draft: DesignDraft): Promise<void> {
  const survey = createSurvey({
    title: draft.title.trim() || "無題のアンケート",
    purpose: draft.purpose,
    audience: draft.audience,
    intro_text: draft.intro_text,
    viewpoint: toViewpoint(draft.viewpoint),
  });
  replaceTopics(
    survey.id,
    draft.topics.map((t) => ({
      label: t.label,
      description: t.description,
      priority: t.priority,
      target_solution_id: t.target_solution_id,
      fallback_question: {
        lead: "",
        text: t.fallback_question.text,
        kind: t.fallback_question.kind,
        options: t.fallback_question.options,
        topic_id: "",
        satisfied_topic_ids: [],
      },
    })),
  );
  if (draft.solution_ids.length > 0) setSurveySolutions(survey.id, draft.solution_ids);
  revalidatePath("/admin");
  redirect(`/admin/${survey.id}`);
}

export async function createBlankSurvey(formData: FormData): Promise<void> {
  const purpose = String(formData.get("purpose") ?? "").trim();
  const audience = String(formData.get("audience") ?? "").trim();
  const viewpoint = toViewpoint(formData.get("viewpoint"));
  const survey = createSurvey({ title: "無題のアンケート", purpose, audience, intro_text: "", viewpoint });
  revalidatePath("/admin");
  redirect(`/admin/${survey.id}`);
}

export async function updateSurveyAction(surveyId: string, formData: FormData): Promise<void> {
  updateSurvey(surveyId, {
    title: String(formData.get("title") ?? "").trim(),
    purpose: String(formData.get("purpose") ?? "").trim(),
    audience: String(formData.get("audience") ?? "").trim(),
    intro_text: String(formData.get("intro_text") ?? "").trim(),
    max_per_topic: clampInt(formData.get("max_per_topic"), 1, 6, 3),
    hard_cap: clampInt(formData.get("hard_cap"), 3, 40, 15),
    cta_text: String(formData.get("cta_text") ?? "").trim() || "ブースのスタッフにお尋ねください",
    viewpoint: toViewpoint(formData.get("viewpoint")),
  });
  revalidatePath(`/admin/${surveyId}`);
}

export async function setSurveySolutionsAction(surveyId: string, solutionIds: string[]): Promise<void> {
  setSurveySolutions(surveyId, solutionIds);
  revalidatePath(`/admin/${surveyId}`);
}

export async function createSolutionAction(input: SolutionInput): Promise<Solution> {
  const solution = createSolution({
    name: input.name.trim().slice(0, 40),
    pitch: input.pitch.trim().slice(0, 100),
    description: input.description.trim().slice(0, 300),
    url: input.url?.trim() || null,
  });
  revalidatePath("/admin/solutions");
  revalidatePath("/admin/new");
  return solution;
}

export async function updateSolutionAction(id: string, input: SolutionInput): Promise<void> {
  updateSolution(id, {
    name: input.name.trim().slice(0, 40),
    pitch: input.pitch.trim().slice(0, 100),
    description: input.description.trim().slice(0, 300),
    url: input.url?.trim() || null,
  });
  revalidatePath("/admin/solutions");
}

export async function deleteSolutionAction(id: string): Promise<void> {
  deleteSolution(id);
  revalidatePath("/admin/solutions");
}

export async function saveTopicsAction(surveyId: string, topics: TopicInput[]): Promise<void> {
  const cleaned = topics
    .filter((t) => t.label.trim())
    .map((t) => ({
      ...t,
      label: t.label.trim().slice(0, 30),
      description: t.description.trim().slice(0, 200),
      priority: Math.min(3, Math.max(1, Math.round(t.priority) || 1)),
      fallback_question:
        t.fallback_question && t.fallback_question.text.trim()
          ? { ...t.fallback_question, text: t.fallback_question.text.trim() }
          : null,
    }));
  replaceTopics(surveyId, cleaned);
  revalidatePath(`/admin/${surveyId}`);
}

export async function updateSeedQ1Action(surveyId: string, q1: GeneratedQuestion): Promise<void> {
  const survey = getSurvey(surveyId);
  if (!survey) return;
  const topics = listTopics(surveyId);
  const topicId = topics.some((t) => t.id === q1.topic_id) ? q1.topic_id : (topics[0]?.id ?? "");
  const cleaned: GeneratedQuestion = {
    lead: "",
    text: q1.text.trim().slice(0, 80),
    kind: q1.kind,
    options: q1.options.map((o) => o.trim()).filter(Boolean).slice(0, 5),
    topic_id: topicId,
    satisfied_topic_ids: [],
  };
  setSeedQuestions(surveyId, { q1: cleaned, q2_by_option: {} });
  revalidatePath(`/admin/${surveyId}`);
}

export async function setStatusAction(surveyId: string, status: SurveyStatus): Promise<void> {
  const survey = getSurvey(surveyId);
  if (!survey) return;
  if (status === "published") {
    if (listTopics(surveyId).length === 0) throw new Error("論点がありません");
    if (!survey.seed_questions?.q1) throw new Error("最初の質問がありません");
  }
  setSurveyStatus(surveyId, status);
  revalidatePath("/admin");
  revalidatePath(`/admin/${surveyId}`);
}

export async function deleteSurveyAction(surveyId: string): Promise<void> {
  deleteSurvey(surveyId);
  revalidatePath("/admin");
  redirect("/admin");
}

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const settings: LlmSettings = {
    baseUrl: String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, "") || "http://localhost:8080",
    model: String(formData.get("model") ?? "").trim(),
    temperature: clampFloat(formData.get("temperature"), 0, 2, 0.7),
    maxConcurrency: clampInt(formData.get("maxConcurrency"), 1, 8, 1),
  };
  saveLlmSettings(settings);
  revalidatePath("/admin/settings");
}

function clampInt(v: FormDataEntryValue | null, min: number, max: number, fallback: number): number {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(v: FormDataEntryValue | null, min: number, max: number, fallback: number): number {
  const n = parseFloat(String(v ?? ""));
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
