import { request as httpsRequest } from "node:https";

const TLS_FALLBACK_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function tlsErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  const direct = "code" in error ? (error as { code?: unknown }).code : undefined;
  const cause =
    "cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause
      ? (error.cause as { code?: unknown }).code
      : undefined;

  return String(direct ?? cause ?? "");
}

function responseHeaders(headers: Record<string, string | string[] | undefined>) {
  const normalized = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized.set(key, value.join(", "));
    } else if (value !== undefined) {
      normalized.set(key, value);
    }
  }

  return normalized;
}

async function bodyBuffer(body: BodyInit | null | undefined) {
  if (!body) {
    return undefined;
  }

  if (typeof body === "string") {
    return Buffer.from(body);
  }

  if (body instanceof URLSearchParams) {
    return Buffer.from(body.toString());
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }

  if (body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }

  return undefined;
}

async function insecureHttpsFetch(url: string, init: RequestInit = {}) {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:") {
    throw new Error("TLS fallback only supports HTTPS URLs.");
  }

  const body = await bodyBuffer(init.body);

  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(
      parsed,
      {
        method: init.method ?? (body ? "POST" : "GET"),
        headers: init.headers as Record<string, string> | undefined,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 0,
              statusText: res.statusMessage,
              headers: responseHeaders(res.headers),
            }),
          );
        });
      },
    );

    req.on("error", reject);
    init.signal?.addEventListener("abort", () => {
      req.destroy(new DOMException("Aborted", "AbortError"));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

export async function fetchWithTlsFallback(
  fetcher: typeof fetch,
  input: string | URL,
  init?: RequestInit,
) {
  try {
    return await fetcher(input, init);
  } catch (error) {
    if (fetcher !== fetch || !TLS_FALLBACK_CODES.has(tlsErrorCode(error))) {
      throw error;
    }

    return insecureHttpsFetch(input.toString(), init);
  }
}
