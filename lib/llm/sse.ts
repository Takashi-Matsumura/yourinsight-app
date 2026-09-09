export type SseSend = (event: string, data: unknown) => void;

export function sseResponse(
  handler: (send: SseSend, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send: SseSend = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const onAbort = () => {
        closed = true;
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        await handler(send, signal);
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        signal.removeEventListener("abort", onAbort);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
