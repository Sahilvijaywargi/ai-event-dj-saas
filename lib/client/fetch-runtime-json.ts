export type RuntimeJsonFetchOptions = {
  /** When true, non-2xx responses still return parsed JSON instead of throwing. */
  allowNonOk?: boolean;
  /** Retry when the server returns non-JSON (e.g. dev 404 HTML while a route compiles). */
  retries?: number;
  retryDelayMs?: number;
};

export type RuntimeJsonFetchResult<T> = {
  data: T;
  response: Response;
};

function extractErrorMessage(data: Record<string, unknown>, status: number) {
  if (typeof data.message === "string" && data.message.length > 0) return data.message;
  if (typeof data.error === "string" && data.error.length > 0) return data.error;
  return `Request failed with status ${status}`;
}

export async function fetchRuntimeJson<T extends Record<string, unknown>>(
  url: string,
  init?: RequestInit,
  options?: RuntimeJsonFetchOptions,
): Promise<RuntimeJsonFetchResult<T>> {
  const retries = options?.retries ?? 0;
  const retryDelayMs = options?.retryDelayMs ?? 1500;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    console.log("[SYNC FETCH]", url, attempt > 0 ? `(retry ${attempt}/${retries})` : "");
    const response = await fetch(url, init);
    console.log("[SYNC STATUS]", response.status, url);

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      console.error("[SYNC API INVALID RESPONSE]", {
        url,
        status: response.status,
        contentType: contentType || "unknown",
        body: text.slice(0, 500),
      });
      const compileHint =
        response.status === 404
          ? " Next.js returned an HTML 404 page — the route may still be compiling in dev or the path is missing."
          : "";
      lastError = new Error(
        `[${url}] Expected JSON but received ${contentType || "unknown"} (HTTP ${response.status}).${compileHint}`,
      );
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      throw lastError;
    }

    const data = (await response.json()) as T;
    if (!options?.allowNonOk && !response.ok) {
      throw new Error(`[${url}] ${extractErrorMessage(data, response.status)}`);
    }
    return { data, response };
  }

  throw lastError ?? new Error(`[${url}] Request failed after ${retries} retries.`);
}
