export interface SseEvent {
  event: string;
  data: unknown;
}

export async function readSse(res: Response, onEvent: (e: SseEvent) => void): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error("empty body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let event = "message";
  let data = "";

  const flush = () => {
    if (data === "") return;
    let parsed: unknown = data;
    try {
      parsed = JSON.parse(data);
    } catch {
      // keep raw string
    }
    onEvent({ event, data: parsed });
    event = "message";
    data = "";
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line === "") {
        flush();
      } else if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data += (data ? "\n" : "") + line.slice(5).trim();
      }
    }
  }
  flush();
}
