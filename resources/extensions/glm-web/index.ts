import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const webSearchSchema = Type.Object({
  query: Type.String({ description: "Search query" }),
  maxResults: Type.Optional(
    Type.Integer({
      description: "Maximum number of results to return (default 5, max 10).",
      minimum: 1,
      maximum: 10,
    }),
  ),
  allowedDomains: Type.Optional(
    Type.Array(
      Type.String({
        description: "Optional list of allowed domains (host suffix match). Example: ['docs.modelscope.cn']",
      }),
      { description: "Only keep results from these domains." },
    ),
  ),
});

const webFetchSchema = Type.Object({
  url: Type.String({ description: "HTTP(S) URL to fetch" }),
  maxBytes: Type.Optional(
    Type.Integer({
      description: "Maximum response bytes to read (default 1,000,000; max 5,000,000).",
      minimum: 1,
      maximum: 5_000_000,
    }),
  ),
});

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hostMatchesAllowedDomains(url: URL, allowed: string[]): boolean {
  const host = url.hostname.toLowerCase();
  for (const raw of allowed) {
    const domain = raw.trim().toLowerCase();
    if (!domain) continue;
    if (host === domain) return true;
    if (host.endsWith(`.${domain}`)) return true;
  }
  return false;
}

function stripHtml(html: string): string {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const withoutTags = withoutScripts.replace(/<\/?[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "No results.";

  const lines: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    lines.push(`${i + 1}. ${item.title}`.trim());
    lines.push(item.url);
    if (item.snippet) {
      lines.push(item.snippet);
    }
    if (i < results.length - 1) {
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function searchWithBraveApi(query: string, count: number, signal?: AbortSignal): Promise<SearchResult[]> {
  const key = process.env.BRAVE_API_KEY?.trim();
  if (!key) {
    throw new Error("BRAVE_API_KEY is required for Brave Search backend");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      "X-Subscription-Token": key,
    },
    signal,
  });

  const json = (await res.json()) as any;
  const raw = json?.web?.results;
  if (!res.ok) {
    const message = typeof json?.message === "string" ? json.message : `HTTP ${res.status}`;
    throw new Error(message);
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any) => ({
      title: String(item?.title ?? ""),
      url: String(item?.url ?? ""),
      snippet: String(item?.description ?? ""),
    }))
    .filter((item: SearchResult) => Boolean(item.url));
}

async function searchWithSearx(query: string, count: number, signal?: AbortSignal): Promise<SearchResult[]> {
  const endpoint = process.env.GLM_WEB_SEARCH_URL?.trim();
  if (!endpoint) {
    throw new Error("GLM_WEB_SEARCH_URL is required for SearxNG backend");
  }

  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });

  const json = (await res.json()) as any;
  if (!res.ok) {
    const message = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
    throw new Error(message);
  }

  const raw = json?.results;
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, count)
    .map((item: any) => ({
      title: String(item?.title ?? ""),
      url: String(item?.url ?? ""),
      snippet: String(item?.content ?? ""),
    }))
    .filter((item: SearchResult) => Boolean(item.url));
}

async function runWebSearch(query: string, count: number, signal?: AbortSignal): Promise<SearchResult[]> {
  // Prefer Brave when available (explicit API key).
  if (process.env.BRAVE_API_KEY?.trim()) {
    return searchWithBraveApi(query, count, signal);
  }

  // Otherwise allow users to point to a SearxNG instance.
  if (process.env.GLM_WEB_SEARCH_URL?.trim()) {
    return searchWithSearx(query, count, signal);
  }

  throw new Error(
    "web_search is not configured. Set BRAVE_API_KEY (Brave Search API) or GLM_WEB_SEARCH_URL (SearxNG JSON endpoint), or use MCP web search tools.",
  );
}

export default function (pi: ExtensionAPI) {
  pi.registerTool(
    defineTool({
      name: "web_search",
      label: "Web search",
      description:
        "Search the web for up-to-date information. Configure with BRAVE_API_KEY or GLM_WEB_SEARCH_URL. Prefer using web_fetch for opening specific URLs.",
      promptSnippet: "web_search: search the web for up-to-date information",
      parameters: webSearchSchema,
      execute: async (_toolCallId, params, signal) => {
        const query = params.query.trim();
        if (!query) {
          throw new Error("query must not be empty");
        }

        const count = Math.min(Math.max(params.maxResults ?? 5, 1), 10);
        const allowedDomains = (params.allowedDomains ?? []).map((d) => d.trim()).filter(Boolean);

        let results = await runWebSearch(query, count, signal);

        if (allowedDomains.length > 0) {
          results = results.filter((item) => {
            try {
              return hostMatchesAllowedDomains(new URL(item.url), allowedDomains);
            } catch {
              return false;
            }
          });
        }

        // Clamp after filtering.
        results = results.slice(0, count);

        return {
          content: [{ type: "text", text: formatSearchResults(results) }],
          details: { results },
        };
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "web_fetch",
      label: "Web fetch",
      description:
        "Fetch a URL over HTTP(S) and return the response as plain text (HTML is stripped).",
      promptSnippet: "web_fetch: fetch a URL and extract plain text",
      parameters: webFetchSchema,
      execute: async (_toolCallId, params, signal) => {
        const url = params.url.trim();
        if (!isHttpUrl(url)) {
          throw new Error("Only http(s) URLs are supported");
        }

        const maxBytes = Math.min(Math.max(params.maxBytes ?? 1_000_000, 1), 5_000_000);

        const res = await fetch(url, {
          method: "GET",
          headers: {
            accept: "text/html,application/json,text/plain,*/*",
          },
          signal,
        });

        const contentType = res.headers.get("content-type") ?? "";
        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Empty response body");
        }

        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > maxBytes) {
            throw new Error(`Response too large (>${maxBytes} bytes)`);
          }
          chunks.push(value);
        }

        const text = new TextDecoder("utf-8").decode(
          chunks.length === 1 ? chunks[0] : Buffer.concat(chunks as any),
        );

        if (!res.ok) {
          throw new Error(`${res.status} ${text}`.trim());
        }

        const trimmed =
          contentType.toLowerCase().includes("text/html") ? stripHtml(text) : text.trim();

        const maxChars = 30_000;
        const finalText = trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}\n…` : trimmed;

        return {
          content: [{ type: "text", text: finalText }],
          details: { url, contentType, bytes: total },
        };
      },
    }),
  );
}

