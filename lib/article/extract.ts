import type { FetchImplementation } from "@/lib/collectors/http";

/**
 * Fetches a story's original page and pulls out its readable paragraphs so the
 * summarizer can cover the whole article, not just the feed's one-line blurb.
 *
 * The text is used transiently for one summary request and never stored
 * (AGENTS.md: store metadata and derived summaries, not full articles). Pages
 * that refuse the request, need JavaScript or sit behind a paywall simply
 * yield null and the summary falls back to the feed excerpt.
 */

/** Hosts whose pages never contain the article itself, or that block bots. */
const skippedHosts = [
  "news.google.com", // redirect pages decoded by JavaScript
  "reddit.com", // blocks unauthenticated requests; the feed excerpt has the post body
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "chromewebstore.google.com",
];

const defaultMaxChars = 6_000;
const minimumUsefulChars = 300;
const maxHtmlBytes = 2_000_000;

export interface ArticleFetchOptions {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  maxChars?: number;
}

export async function fetchArticleText(
  url: string,
  options: ArticleFetchOptions = {},
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (skippedHosts.some((skipped) => host === skipped || host.endsWith(`.${skipped}`))) return null;

  const fetchImplementation = options.fetchImplementation ?? fetch;
  try {
    const response = await fetchImplementation(parsed, {
      headers: {
        "User-Agent": "PersonalFeed/1.0 (personal reading summarizer)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html")) return null;
    const html = await response.text();
    if (html.length > maxHtmlBytes) return null;
    return extractArticleText(html, options.maxChars ?? defaultMaxChars);
  } catch {
    return null;
  }
}

/** Readable paragraphs of an HTML page, or null when too little text is found. */
export function extractArticleText(html: string, maxChars = defaultMaxChars): string | null {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|button|select|template)\b[\s\S]*?<\/\1\s*>/gi,
      " ",
    );

  const scope = largestBlock(cleaned, "article") ?? largestBlock(cleaned, "main") ?? cleaned;
  const paragraphs: string[] = [];
  let total = 0;

  for (const match of scope.matchAll(/<(p|h2|h3|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const text = toPlainText(match[2] ?? "");
    if (!isUseful(text)) continue;
    if (paragraphs.at(-1) === text) continue;
    paragraphs.push(text);
    total += text.length + 1;
    if (total >= maxChars) break;
  }

  const joined = paragraphs.join("\n");
  if (joined.length < minimumUsefulChars) return null;
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

function largestBlock(html: string, tag: string): string | null {
  let best: string | null = null;
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi");
  for (const match of html.matchAll(pattern)) {
    const inner = match[1] ?? "";
    if (!best || inner.length > best.length) best = inner;
  }
  return best;
}

/** A paragraph worth sending: long enough to carry information. */
function isUseful(text: string) {
  const cjk = text.match(/[㐀-鿿]/g)?.length ?? 0;
  return cjk >= 15 || text.length >= 60;
}

function toPlainText(fragment: string) {
  return decodeEntities(fragment.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const value = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : entity;
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}
