function unescapeJsonString(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, seq: string) => {
    switch (seq[0]) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "u":
        return String.fromCharCode(parseInt(seq.slice(1), 16));
      default:
        return seq;
    }
  });
}

function readString(raw: string, start: number): { value: string; end: number; closed: boolean } {
  let i = start;
  let out = "";
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\") {
      const len = raw[i + 1] === "u" ? 6 : 2;
      if (i + len > raw.length) return { value: unescapeJsonString(out), end: i, closed: false };
      out += raw.slice(i, i + len);
      i += len;
      continue;
    }
    if (ch === '"') return { value: unescapeJsonString(out), end: i + 1, closed: true };
    out += ch;
    i += 1;
  }
  return { value: unescapeJsonString(out), end: i, closed: false };
}

export function extractPartialString(raw: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw);
  if (!m) return null;
  return readString(raw, m.index + m[0].length).value;
}

export function extractAllStrings(raw: string, key: string): string[] {
  const re = new RegExp(`"${key}"\\s*:\\s*"`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out.push(readString(raw, m.index + m[0].length).value);
  }
  return out;
}

export function extractPartialStringArray(raw: string, key: string): string[] | null {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(raw);
  if (!m) return null;
  const items: string[] = [];
  let i = m.index + m[0].length;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "]") break;
    if (ch === '"') {
      const r = readString(raw, i + 1);
      items.push(r.value);
      if (!r.closed) break;
      i = r.end;
      continue;
    }
    i += 1;
  }
  return items;
}
