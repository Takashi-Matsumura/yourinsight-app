export class QueueFullError extends Error {
  constructor() {
    super("LLMキューが満杯です");
    this.name = "QueueFullError";
  }
}

/** 設問生成（訪問者のリアルタイム体験）専用キュー */
export const QUESTION_QUEUE = "question";
/** 振り返り・分析・デザイン生成などの重い/バックグラウンドジョブ専用キュー */
export const HEAVY_QUEUE = "heavy";

interface Waiter {
  id: number;
  start: () => void;
  reject: (e: Error) => void;
  onPosition?: (position: number) => void;
  signal?: AbortSignal;
}

interface QueueState {
  running: number;
  waiting: Waiter[];
  seq: number;
}

const g = globalThis as unknown as { __llmQueues?: Map<string, QueueState> };

function state(name: string): QueueState {
  if (!g.__llmQueues) g.__llmQueues = new Map();
  let s = g.__llmQueues.get(name);
  if (!s) {
    s = { running: 0, waiting: [], seq: 0 };
    g.__llmQueues.set(name, s);
  }
  return s;
}

export interface EnqueueOptions {
  /** どのキューに並ぶか（QUESTION_QUEUE / HEAVY_QUEUE など）。異なるキュー同士は互いを待たない */
  queue: string;
  maxConcurrency: number;
  maxQueue?: number;
  signal?: AbortSignal;
  onPosition?: (position: number) => void;
}

export function queueSnapshot() {
  if (!g.__llmQueues) return {};
  return Object.fromEntries(
    [...g.__llmQueues.entries()].map(([name, s]) => [name, { running: s.running, waiting: s.waiting.length }]),
  );
}

function broadcastPositions(s: QueueState) {
  s.waiting.forEach((w, i) => w.onPosition?.(i + 1));
}

function drain(s: QueueState, maxConcurrency: number) {
  while (s.running < maxConcurrency && s.waiting.length > 0) {
    const next = s.waiting.shift()!;
    if (next.signal?.aborted) {
      next.reject(new DOMException("aborted while queued", "AbortError"));
      continue;
    }
    next.start();
  }
  broadcastPositions(s);
}

export function enqueue<T>(job: () => Promise<T>, opts: EnqueueOptions): Promise<T> {
  const s = state(opts.queue);
  const maxQueue = opts.maxQueue ?? 8;
  const maxConcurrency = Math.max(1, opts.maxConcurrency);

  return new Promise<T>((resolve, reject) => {
    const run = () => {
      s.running += 1;
      job()
        .then(resolve, reject)
        .finally(() => {
          s.running -= 1;
          drain(s, maxConcurrency);
        });
    };

    if (s.running < maxConcurrency && s.waiting.length === 0) {
      run();
      return;
    }
    if (s.waiting.length >= maxQueue) {
      reject(new QueueFullError());
      return;
    }

    const waiter: Waiter = {
      id: ++s.seq,
      start: run,
      reject,
      onPosition: opts.onPosition,
      signal: opts.signal,
    };
    s.waiting.push(waiter);
    opts.onPosition?.(s.waiting.length);

    opts.signal?.addEventListener(
      "abort",
      () => {
        const idx = s.waiting.indexOf(waiter);
        if (idx >= 0) {
          s.waiting.splice(idx, 1);
          reject(new DOMException("aborted while queued", "AbortError"));
          broadcastPositions(s);
        }
      },
      { once: true },
    );
  });
}
