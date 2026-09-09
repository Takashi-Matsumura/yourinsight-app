export type QuestionKind = "single" | "scale" | "text";
export type SurveyStatus = "draft" | "published" | "closed";
export type SurveyViewpoint = "individual" | "organization";
export type SessionStatus = "in_progress" | "completed" | "abandoned";
export type QuestionSource = "seed" | "llm" | "fallback";
export type ReflectionFeedback = "agree" | "disagree";

export interface GeneratedQuestion {
  lead: string;
  text: string;
  kind: QuestionKind;
  options: string[];
  topic_id: string;
  satisfied_topic_ids: string[];
}

export interface SeedQuestions {
  q1: GeneratedQuestion;
  q2_by_option: Record<string, GeneratedQuestion>;
}

export interface Survey {
  id: string;
  title: string;
  purpose: string;
  audience: string;
  intro_text: string;
  max_per_topic: number;
  hard_cap: number;
  status: SurveyStatus;
  seed_questions: SeedQuestions | null;
  cta_text: string;
  viewpoint: SurveyViewpoint;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  survey_id: string;
  order_index: number;
  label: string;
  description: string;
  priority: number;
  fallback_question: GeneratedQuestion | null;
  target_solution_id: string | null;
}

export interface Solution {
  id: string;
  name: string;
  pitch: string;
  description: string;
  url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  survey_id: string;
  status: SessionStatus;
  started_at: string;
  completed_at: string | null;
  ended_early: boolean;
  reflection: string | null;
  reflection_feedback: ReflectionFeedback | null;
  external_id: string | null;
}

export interface Question {
  id: string;
  session_id: string;
  order_index: number;
  topic_id: string | null;
  lead: string;
  text: string;
  kind: QuestionKind;
  options: string[];
  source: QuestionSource;
  latency_ms: number | null;
  created_at: string;
}

export interface Answer {
  id: string;
  question_id: string;
  session_id: string;
  value: string;
  free_text: string | null;
  answered_at: string;
}

export interface TopicCoverage {
  session_id: string;
  topic_id: string;
  satisfied: boolean;
  asked_count: number;
}

export interface LlmSettings {
  baseUrl: string;
  model: string;
  temperature: number;
  maxConcurrency: number;
}

export interface RecommendedSolution {
  solution_id: string | null;
  name: string;
  reason: string;
}

export interface Reflection {
  heard: string[];
  insight: string;
  thanks: string;
  recommended_solutions: RecommendedSolution[];
}

export interface AnalysisIssue {
  title: string;
  description: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  topic_id: string | null;
}

export interface Analysis {
  summary: string;
  issues: AnalysisIssue[];
  confirmed_insights: string[];
  unaddressed_needs: string[];
}
