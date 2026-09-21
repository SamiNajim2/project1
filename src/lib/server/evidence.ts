import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Evidence, EvidenceQuote, ResearchResult, Source, SourceKind } from "../schemas";

type Block = Anthropic.Beta.BetaContentBlock;
type Citation = Anthropic.Beta.BetaTextCitation;

export interface ProvidedDocument {
  title: string;
  kind: Extract<SourceKind, "pdf" | "notes">;
}

interface Span {
  start: number;
  end: number;
  citations: Citation[];
}

const MAX_UNCITED_SOURCES = 25;
const MAX_LINE_FOR_EVIDENCE = 600;

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    let out = url.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out.replace(/^http:\/\//, "https://").replace("://www.", "://");
  } catch {
    return raw.trim();
  }
}

/**
 * Builds the evidence base for the analysis stages from the research turn's content blocks.
 *
 * Evidence and sources come only from citation metadata returned by the API (web search results,
 * fetched pages and the user's documents), never from URLs or titles the model writes in its text.
 */
export function buildResearchResult(
  blocks: Block[],
  documents: ProvidedDocument[],
  userUrls: string[],
): ResearchResult {
  const userUrlSet = new Set(userUrls.map(normalizeUrl));
  const searchResults = new Map<string, { url: string; title: string; pageAge: string | null }>();
  const fetched = new Map<string, { url: string; title: string }>(); // keyed by title and by url
  const fetchedUrls: string[] = [];
  const searches: string[] = [];

  for (const block of blocks) {
    if (block.type === "server_tool_use" && block.name === "web_search") {
      const query = (block.input as { query?: unknown }).query;
      if (typeof query === "string") searches.push(query);
    }
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        const key = normalizeUrl(r.url);
        if (!searchResults.has(key)) searchResults.set(key, { url: r.url, title: r.title, pageAge: r.page_age });
      }
    }
    if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      const url = block.content.url;
      const title = block.content.content.title || url;
      fetched.set(title, { url, title });
      fetched.set(normalizeUrl(url), { url, title });
      fetchedUrls.push(url);
    }
  }

  // Concatenate the answer text and remember which character ranges carry citations.
  let full = "";
  const spans: Span[] = [];
  for (const block of blocks) {
    if (block.type !== "text") continue;
    const start = full.length;
    full += block.text;
    if (block.citations?.length) spans.push({ start, end: full.length, citations: block.citations });
  }

  const sources: Source[] = [];
  const sourceByKey = new Map<string, Source>();
  const register = (key: string, init: Omit<Source, "id" | "cited">): Source => {
    let source = sourceByKey.get(key);
    if (!source) {
      source = { id: `S${sources.length + 1}`, cited: true, ...init };
      sources.push(source);
      sourceByKey.set(key, source);
    }
    return source;
  };

  const webKind = (url: string): SourceKind => (userUrlSet.has(normalizeUrl(url)) ? "user_url" : "web");

  const sourceForCitation = (c: Citation): { source: Source; location: string | null } | null => {
    if (c.type === "web_search_result_location") {
      const key = normalizeUrl(c.url);
      const known = searchResults.get(key);
      return {
        source: register(key, {
          title: c.title || known?.title || c.url,
          url: c.url,
          kind: webKind(c.url),
          pageAge: known?.pageAge ?? null,
        }),
        location: null,
      };
    }
    if (c.type === "search_result_location") {
      const key = normalizeUrl(c.source);
      return {
        source: register(key, { title: c.title || c.source, url: c.source, kind: webKind(c.source), pageAge: null }),
        location: null,
      };
    }
    // Document citations (char/page/content-block locations): the user's PDFs and notes, or fetched pages.
    const title = c.document_title ?? "";
    const location =
      c.type === "page_location"
        ? c.start_page_number === c.end_page_number - 1 || c.start_page_number === c.end_page_number
          ? `p. ${c.start_page_number}`
          : `pp. ${c.start_page_number}–${c.end_page_number - 1}`
        : null;
    const doc = documents.find((d) => d.title === title) ?? (title ? undefined : documents[c.document_index]);
    if (doc) {
      return { source: register(`doc:${doc.title}`, { title: doc.title, url: null, kind: doc.kind, pageAge: null }), location };
    }
    const page = fetched.get(title) ?? fetched.get(normalizeUrl(title));
    if (page) {
      return {
        source: register(normalizeUrl(page.url), { title: page.title, url: page.url, kind: webKind(page.url), pageAge: null }),
        location,
      };
    }
    return null; // A citation we cannot tie to a known source is dropped rather than guessed.
  };

  // Group cited spans by the finding (line, or sentence for long lines) they belong to.
  const findings = new Map<string, { start: number; end: number; citations: Citation[] }>();
  for (const span of spans) {
    const [start, end] = findingBounds(full, span.start, span.end);
    const key = `${start}:${end}`;
    const existing = findings.get(key);
    if (existing) existing.citations.push(...span.citations);
    else findings.set(key, { start, end, citations: [...span.citations] });
  }

  const evidence: Evidence[] = [];
  const seenText = new Set<string>();
  for (const f of [...findings.values()].sort((a, b) => a.start - b.start)) {
    const text = cleanFinding(full.slice(f.start, f.end));
    if (!text || seenText.has(text)) continue;
    const quotes: EvidenceQuote[] = [];
    const sourceIds: string[] = [];
    for (const c of f.citations) {
      if (!quoteSupports(text, c.cited_text)) continue;
      const resolved = sourceForCitation(c);
      if (!resolved) continue;
      if (!sourceIds.includes(resolved.source.id)) sourceIds.push(resolved.source.id);
      const quote = c.cited_text.replace(/\s+/g, " ").trim().slice(0, 500);
      if (quote && !quotes.some((q) => q.sourceId === resolved.source.id && q.quote === quote)) {
        quotes.push({ sourceId: resolved.source.id, quote, location: resolved.location });
      }
    }
    if (!sourceIds.length) continue;
    seenText.add(text);
    evidence.push({ id: `E${evidence.length + 1}`, topic: topicAt(full, f.start), text, sourceIds, quotes });
  }

  // Record what was consulted but not cited, so the Sources section is complete and honest.
  const addUncited = (key: string, init: Omit<Source, "id" | "cited">) => {
    if (sourceByKey.has(key)) return;
    const source: Source = { id: `S${sources.length + 1}`, cited: false, ...init };
    sources.push(source);
    sourceByKey.set(key, source);
  };
  for (const url of fetchedUrls) {
    const key = normalizeUrl(url);
    addUncited(key, { title: fetched.get(key)?.title ?? url, url, kind: webKind(url), pageAge: null });
  }
  for (const doc of documents) addUncited(`doc:${doc.title}`, { title: doc.title, url: null, kind: doc.kind, pageAge: null });
  let uncitedWeb = 0;
  for (const [key, r] of searchResults) {
    if (sourceByKey.has(key) || uncitedWeb >= MAX_UNCITED_SOURCES) continue;
    addUncited(key, { title: r.title, url: r.url, kind: webKind(r.url), pageAge: r.pageAge });
    uncitedWeb++;
  }

  return { evidence, sources, gaps: extractGaps(full), searches, completedAt: new Date().toISOString() };
}

const STOPWORDS = new Set(
  "about above after also among and are because been being below between both but can could does down during each from further have having here into its itself just more most much must only other over same should some such than that their them then there these they this those through under until very were what when where which while with within would your year years".split(" "),
);

function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, "").replace(/\.0+$/, "");
    // Years are too common to show that a passage supports a claim.
    if (!/^(19|20)\d\d$/.test(n)) out.add(n);
  }
  return out;
}

function wordsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
    if (!STOPWORDS.has(w)) out.add(w.replace(/(ies|es|s)$/, ""));
  }
  return out;
}

/**
 * Rejects citations whose quoted passage has nothing in common with the finding: no shared figure
 * and fewer than two shared content words. Catches citations the model attached to the wrong source.
 */
function quoteSupports(finding: string, quote: string): boolean {
  if (!quote.trim()) return false;
  const quoteNumbers = numbersIn(quote);
  for (const n of numbersIn(finding)) if (quoteNumbers.has(n)) return true;
  const quoteWords = wordsIn(quote);
  let shared = 0;
  for (const w of wordsIn(finding)) if (quoteWords.has(w) && ++shared >= 2) return true;
  return false;
}

function findingBounds(full: string, start: number, end: number): [number, number] {
  const lineStart = full.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  let lineEnd = full.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = full.length;
  // A cited span can itself contain a newline; keep the whole span.
  if (lineEnd < end) lineEnd = end;
  if (lineEnd - lineStart <= MAX_LINE_FOR_EVIDENCE) return [lineStart, lineEnd];

  // Long paragraph: narrow to the sentence(s) around the cited span.
  const before = full.slice(lineStart, start);
  const sentenceBreak = Math.max(before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! "));
  const sentenceStart = sentenceBreak === -1 ? lineStart : lineStart + sentenceBreak + 2;
  const afterMatch = /[.!?](\s|$)/.exec(full.slice(end, lineEnd));
  const sentenceEnd = afterMatch ? end + afterMatch.index + 1 : lineEnd;
  return [sentenceStart, sentenceEnd];
}

function cleanFinding(raw: string): string {
  return raw
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function topicAt(full: string, index: number): string {
  const headings = [...full.slice(0, index).matchAll(/^#{1,4}\s+(.+)$/gm)];
  const last = headings.at(-1)?.[1]?.trim();
  return last ? last.replace(/\*\*/g, "") : "General";
}

function extractGaps(full: string): string[] {
  const match = /^#{1,4}\s*evidence gaps\s*$/im.exec(full);
  if (!match) return [];
  const rest = full.slice(match.index + match[0].length);
  const next = /^#{1,4}\s+/m.exec(rest);
  const section = next ? rest.slice(0, next.index) : rest;
  return section
    .split("\n")
    .map((line) => cleanFinding(line))
    .filter((line) => line.length > 3);
}
