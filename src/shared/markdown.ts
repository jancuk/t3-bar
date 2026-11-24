export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: MdInline[] }
  | { type: 'italic'; children: MdInline[] }
  | { type: 'strike'; children: MdInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; href: string };

export type MdBlock =
  | { type: 'heading'; level: number; children: MdInline[] }
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'list'; ordered: boolean; items: MdInline[][] }
  | { type: 'quote'; children: MdInline[] }
  | { type: 'hr' };

function safeHref(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    return null;
  } catch {
    return null;
  }
}

/** Parses inline Markdown into a safe AST (no HTML interpretation). */
export function parseInlines(input: string): MdInline[] {
  const out: MdInline[] = [];
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf) {
      out.push({ type: 'text', text: buf });
      buf = '';
    }
  };

  while (i < input.length) {
    const ch = input[i]!;

    // Backslash escape for Markdown punctuation
    if (ch === '\\' && i + 1 < input.length && /[\\`*_{}[\]()#+\-.!~]/.test(input[i + 1]!)) {
      buf += input[i + 1]!;
      i += 2;
      continue;
    }

    // Inline code: `...`
    if (ch === '`') {
      const end = input.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: 'code', text: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Link: [label](url)
    if (ch === '[') {
      const closeBracket = input.indexOf(']', i + 1);
      if (closeBracket > i + 1 && input[closeBracket + 1] === '(') {
        const closeParen = input.indexOf(')', closeBracket + 2);
        if (closeParen > closeBracket + 2) {
          const label = input.slice(i + 1, closeBracket);
          const rawUrl = input.slice(closeBracket + 2, closeParen);
          const href = safeHref(rawUrl);
          if (href) {
            flush();
            out.push({ type: 'link', label, href });
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Bold: **...** or __...__
    if ((ch === '*' && input[i + 1] === '*') || (ch === '_' && input[i + 1] === '_')) {
      const delim = input.slice(i, i + 2);
      const prev = i > 0 ? input[i - 1]! : '';
      const validStart = delim === '**' || !/[A-Za-z0-9]/.test(prev);
      if (validStart) {
        const end = input.indexOf(delim, i + 2);
        if (end > i + 2 && input[i + 2] !== ' ' && input[end - 1] !== ' ') {
          flush();
          out.push({ type: 'bold', children: parseInlines(input.slice(i + 2, end)) });
          i = end + 2;
          continue;
        }
      }
    }

    // Strikethrough: ~~...~~
    if (ch === '~' && input[i + 1] === '~') {
      const end = input.indexOf('~~', i + 2);
      if (end > i + 2 && input[i + 2] !== ' ' && input[end - 1] !== ' ') {
        flush();
        out.push({ type: 'strike', children: parseInlines(input.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // Italic: *...* or _..._ (avoid matching snake_case identifiers like sinau_mobile)
    if ((ch === '*' && input[i + 1] !== '*') || (ch === '_' && input[i + 1] !== '_')) {
      const prev = i > 0 ? input[i - 1]! : '';
      const validStart = ch === '*' || !/[A-Za-z0-9]/.test(prev);
      if (validStart && i + 1 < input.length && input[i + 1] !== ' ') {
        let end = -1;
        for (let j = i + 1; j < input.length; j++) {
          if (input[j] === ch && input[j - 1] !== ' ' && input[j - 1] !== '\\') {
            const next = j + 1 < input.length ? input[j + 1]! : '';
            if (ch === '*' || !/[A-Za-z0-9]/.test(next)) {
              end = j;
              break;
            }
          }
        }
        if (end > i + 1) {
          flush();
          out.push({ type: 'italic', children: parseInlines(input.slice(i + 1, end)) });
          i = end + 1;
          continue;
        }
      }
    }

    buf += ch;
    i++;
  }

  flush();
  return out;
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const UL_RE = /^\s*[-*+]\s+(.+)$/;
const OL_RE = /^\s*\d+\.\s+(.+)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/;
const FENCE_RE = /^\s*```([^\s`]*)\s*$/;

function isBlockStarter(line: string): boolean {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    UL_RE.test(line) ||
    OL_RE.test(line) ||
    QUOTE_RE.test(line) ||
    HR_RE.test(line)
  );
}

/** Parses block-level Markdown into a safe AST for React rendering. */
export function parseMarkdown(input: string): MdBlock[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const lang = fence[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push({ type: 'code', lang, text: codeLines.join('\n') });
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Heading
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length, children: parseInlines(heading[2]!.trim()) });
      i++;
      continue;
    }

    // Blockquote
    if (QUOTE_RE.test(line)) {
      const qLines: string[] = [];
      while (i < lines.length) {
        const m = QUOTE_RE.exec(lines[i]!);
        if (!m) break;
        qLines.push(m[1]!);
        i++;
      }
      blocks.push({ type: 'quote', children: parseInlines(qLines.join('\n').trim()) });
      continue;
    }

    // Unordered list
    if (UL_RE.test(line)) {
      const items: MdInline[][] = [];
      while (i < lines.length) {
        const m = UL_RE.exec(lines[i]!);
        if (!m) break;
        items.push(parseInlines(m[1]!));
        i++;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Ordered list
    if (OL_RE.test(line)) {
      const items: MdInline[][] = [];
      while (i < lines.length) {
        const m = OL_RE.exec(lines[i]!);
        if (!m) break;
        items.push(parseInlines(m[1]!));
        i++;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    // Paragraph
    const pLines: string[] = [line];
    i++;
    while (i < lines.length && lines[i]!.trim() !== '' && !isBlockStarter(lines[i]!)) {
      pLines.push(lines[i]!);
      i++;
    }
    blocks.push({ type: 'paragraph', children: parseInlines(pLines.join('\n')) });
  }

  return blocks;
}
