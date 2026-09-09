import type { LlmSettings } from "@/lib/types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export interface CompleteOptions {
  settings: LlmSettings;
  messages: ChatMessage[];
  schema?: JsonSchemaSpec;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface CompleteResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  latencyMs: number;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

const DEFAULT_TIMEOUT_MS = 60_000;

function endpoint(settings: LlmSettings): string {
  return `${settings.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
}

function buildBody(opts: CompleteOptions, stream: boolean) {
  return {
    model: opts.settings.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 300,
    temperature: opts.temperature ?? opts.settings.temperature,
    stream,
    ...(opts.schema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema },
          },
        }
      : {}),
  };
}

function combinedSignal(opts: CompleteOptions): AbortSignal {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
}

async function post(opts: CompleteOptions, stream: boolean): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(endpoint(opts.settings), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(opts, stream)),
      signal: combinedSignal(opts),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new LlmError(`LLMサーバに接続できません: ${msg}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LlmError(`LLM ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  return res;
}

export async function complete(opts: CompleteOptions): Promise<CompleteResult> {
  const started = Date.now();
  const res = await post(opts, false);
  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LlmError("LLMの応答に content がありません");
  }
  return {
    content,
    promptTokens: json?.usage?.prompt_tokens ?? 0,
    completionTokens: json?.usage?.completion_tokens ?? 0,
    cachedTokens: json?.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    latencyMs: Date.now() - started,
  };
}

export async function* completeStream(opts: CompleteOptions): AsyncGenerator<string, void> {
  const res = await post(opts, true);
  if (!res.body) throw new LlmError("LLMの応答にbodyがありません");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = (parsed as { choices?: { delta?: { content?: string } }[] })?.choices?.[0]
          ?.delta?.content;
        if (delta) yield delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface ConnectionCheck {
  ok: boolean;
  models: string[];
  modelFound: boolean;
  jsonSchemaOk: boolean;
  latencyMs: number | null;
  error: string | null;
}

export async function checkConnection(settings: LlmSettings): Promise<ConnectionCheck> {
  const result: ConnectionCheck = {
    ok: false,
    models: [],
    modelFound: false,
    jsonSchemaOk: false,
    latencyMs: null,
    error: null,
  };
  try {
    const res = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/v1/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new LlmError(`/v1/models が ${res.status} を返しました`, res.status);
    const json = await res.json();
    result.models = ((json?.data ?? []) as { id: string }[]).map((m) => m.id);
    result.modelFound = result.models.includes(settings.model);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }
  try {
    const r = await complete({
      settings,
      messages: [{ role: "user", content: "「はい」とだけJSONで答えてください。" }],
      schema: {
        name: "ping",
        schema: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
          additionalProperties: false,
        },
      },
      maxTokens: 20,
      temperature: 0,
      timeoutMs: 30_000,
    });
    JSON.parse(r.content);
    result.jsonSchemaOk = true;
    result.latencyMs = r.latencyMs;
    result.ok = true;
  } catch (e) {
    result.error = `JSON Schema出力の検証に失敗: ${e instanceof Error ? e.message : String(e)}`;
  }
  return result;
}
