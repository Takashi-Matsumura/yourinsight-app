import type { JsonSchemaSpec } from "./client";

const KIND_ENUM = ["single", "scale", "text"];

const questionCore = {
  lead: { type: "string", maxLength: 60 },
  text: { type: "string", minLength: 4, maxLength: 80 },
  kind: { type: "string", enum: KIND_ENUM },
  options: {
    type: "array",
    items: { type: "string", maxLength: 30 },
    minItems: 0,
    maxItems: 5,
  },
};

export function nextQuestionSchema(topicKeys: string[], opts: { allowText?: boolean } = {}): JsonSchemaSpec {
  const kinds = opts.allowText === false ? ["single", "scale"] : KIND_ENUM;
  return {
    name: "next_question",
    schema: {
      type: "object",
      properties: {
        done: { type: "boolean" },
        satisfied_topic_ids: {
          type: "array",
          items: { type: "string", enum: topicKeys },
          maxItems: topicKeys.length,
        },
        topic_id: { type: "string", enum: topicKeys },
        ...questionCore,
        kind: { type: "string", enum: kinds },
      },
      required: ["done", "satisfied_topic_ids", "topic_id", "lead", "text", "kind", "options"],
      additionalProperties: false,
    },
  };
}

export function surveyDesignSchema(solutionKeys: string[] = []): JsonSchemaSpec {
  const solutionEnum = [...solutionKeys, ""];
  return {
    name: "survey_design",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 40 },
        intro_text: { type: "string", maxLength: 160 },
        topics: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              label: { type: "string", maxLength: 20 },
              description: { type: "string", maxLength: 100 },
              priority: { type: "integer", minimum: 1, maximum: 3 },
              target_solution_key: { type: "string", enum: solutionEnum },
              fallback_question: {
                type: "object",
                properties: {
                  text: questionCore.text,
                  kind: questionCore.kind,
                  options: questionCore.options,
                },
                required: ["text", "kind", "options"],
                additionalProperties: false,
              },
            },
            required: ["label", "description", "priority", "target_solution_key", "fallback_question"],
            additionalProperties: false,
          },
        },
      },
      required: ["title", "intro_text", "topics"],
      additionalProperties: false,
    },
  };
}

export function reflectionSchema(solutionKeys: string[] = []): JsonSchemaSpec {
  const properties: Record<string, unknown> = {
    heard: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string", maxLength: 50 },
    },
    insight: { type: "string", minLength: 20, maxLength: 140 },
    thanks: { type: "string", maxLength: 30 },
  };
  const required = ["heard", "insight", "thanks"];

  if (solutionKeys.length > 0) {
    properties.recommended_solutions = {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          solution_key: { type: "string", enum: solutionKeys },
          reason: { type: "string", maxLength: 80 },
        },
        required: ["solution_key", "reason"],
        additionalProperties: false,
      },
    };
    required.push("recommended_solutions");
  }

  return {
    name: "reflection",
    schema: { type: "object", properties, required, additionalProperties: false },
  };
}

export function analysisSchema(topicIds: string[], solutionKeys: string[] = []): JsonSchemaSpec {
  const properties: Record<string, unknown> = {
    summary: { type: "string", maxLength: 300 },
    issues: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 40 },
          description: { type: "string", maxLength: 240 },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", maxLength: 100 },
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          topic_id: { type: "string", enum: [...topicIds, ""] },
        },
        required: ["title", "description", "evidence", "confidence", "topic_id"],
        additionalProperties: false,
      },
    },
    confirmed_insights: {
      type: "array",
      maxItems: 5,
      items: { type: "string", maxLength: 120 },
    },
  };
  const required = ["summary", "issues", "confirmed_insights"];

  if (solutionKeys.length > 0) {
    properties.unaddressed_needs = {
      type: "array",
      maxItems: 5,
      items: { type: "string", maxLength: 100 },
    };
    required.push("unaddressed_needs");
  }

  return {
    name: "analysis",
    schema: { type: "object", properties, required, additionalProperties: false },
  };
}
