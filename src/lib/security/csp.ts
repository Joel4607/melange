type CspEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_MAP_TILE_URL?: string;
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?: string;
};

const NONCE_PATTERN = /^[A-Za-z0-9_-]{20,}$/;
// Next.js 16.3.3's built-in not-found/error page emits this one static style
// without a nonce. The exact hash keeps that page usable without opening all
// inline style elements.
const NEXT_ERROR_STYLE_HASH =
  "'sha256-Z5XTK23DFuEMs0PwnyZDO9SWxemQ5HxcpVaBNuUJyWY='";

function configuredOrigin(
  rawValue: string | undefined,
  environment: CspEnvironment,
  allowSubdomainTemplate = false,
): string | null {
  const value = rawValue?.trim();
  if (!value) return null;

  const subdomainMarker = "csp-subdomain";
  const parseable = value.replaceAll("{s}", subdomainMarker);

  let url: URL;
  try {
    url = new URL(parseable);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (environment.NODE_ENV !== "development" && url.protocol !== "https:") return null;

  if (allowSubdomainTemplate && url.hostname.startsWith(`${subdomainMarker}.`)) {
    const hostname = url.hostname.slice(subdomainMarker.length + 1);
    return `${url.protocol}//*.${hostname}${url.port ? `:${url.port}` : ""}`;
  }

  return url.origin;
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function createCspNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createContentSecurityPolicy(
  nonce: string,
  environment: CspEnvironment = process.env,
): string {
  if (!NONCE_PATTERN.test(nonce)) {
    throw new Error("CSP nonce contains invalid characters or insufficient entropy");
  }

  const isDevelopment = environment.NODE_ENV === "development";
  const supabaseOrigin = configuredOrigin(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment,
  );
  const supabaseWebSocketOrigin = supabaseOrigin
    ? supabaseOrigin.replace(/^https:/, "wss:").replace(/^http:/, "ws:")
    : null;

  const customTileOrigin = configuredOrigin(
    environment.NEXT_PUBLIC_MAP_TILE_URL,
    environment,
    true,
  );
  const tileOrigin = environment.NEXT_PUBLIC_MAP_TILE_URL?.trim()
    ? customTileOrigin
    : environment.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim()
      ? "https://api.mapbox.com"
      : "https://*.tile.openstreetmap.org";

  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];
  const connectSources = unique([
    "'self'",
    supabaseOrigin,
    supabaseWebSocketOrigin,
    ...(isDevelopment ? ["ws:"] : []),
  ]);
  const imageSources = unique([
    "'self'",
    "data:",
    "blob:",
    supabaseOrigin,
    tileOrigin,
  ]);

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}' ${NEXT_ERROR_STYLE_HASH}`,
    "style-src-attr 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self' data:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
