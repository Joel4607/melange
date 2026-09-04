import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface SecurityModule {
  auditSupabaseLocalConfig?: (source: string) => string[];
  localSupabaseStartPlan?: () => {
    networkName: string;
    hostBinding: string;
    createNetworkArgs: string[];
    startArgs: string[];
  };
}

async function loadSecurityModule(): Promise<SecurityModule> {
  try {
    return await import(
      /* @vite-ignore */ pathToFileURL(
        resolve(process.cwd(), "scripts/supabase-local-security.mjs"),
      ).href
    );
  } catch {
    return {};
  }
}

describe("SEC-012 local Supabase boundary", () => {
  it("pins the Supabase CLI used by the safe local launcher", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };

    expect(packageJson.devDependencies?.supabase).toBe("2.107.0");
  });

  it("accepts the checked-in local configuration", async () => {
    const security = await loadSecurityModule();
    const config = readFileSync(
      resolve(process.cwd(), "supabase/config.toml"),
      "utf8",
    );

    expect(security.auditSupabaseLocalConfig?.(config)).toEqual([]);
  });

  it("rejects weak authentication and unnecessary exposed services", async () => {
    const security = await loadSecurityModule();
    const insecure = `
[auth]
site_url = "https://devbox.example"
additional_redirect_urls = ["https://attacker.example/callback"]
minimum_password_length = 6
password_requirements = ""

[auth.email]
secure_password_change = false
max_frequency = "1s"

[auth.sms]
enable_signup = true

[auth.sms.twilio]
enabled = true

[storage]
file_size_limit = "50MiB"

[storage.s3_protocol]
enabled = true

[analytics]
enabled = true
`;

    const errors = security.auditSupabaseLocalConfig?.(insecure) ?? [];
    expect(errors).toContain("auth.site_url must use a loopback host");
    expect(errors).toContain("auth.minimum_password_length must be at least 12");
    expect(errors).toContain("auth.password_requirements must require letters and digits");
    expect(errors).toContain("auth.email.secure_password_change must be enabled");
    expect(errors).toContain("auth.email.max_frequency must be at least 60 seconds");
    expect(errors).toContain("auth.sms.enable_signup must be disabled");
    expect(errors).toContain("auth.sms.twilio.enabled must be disabled");
    expect(errors).toContain("storage.file_size_limit must not exceed 10MiB");
    expect(errors).toContain("storage.s3_protocol.enabled must be disabled");
    expect(errors).toContain("analytics.enabled must be disabled");
  });

  it("starts through a Docker network whose published ports bind to localhost", async () => {
    const security = await loadSecurityModule();

    expect(security.localSupabaseStartPlan?.()).toEqual({
      networkName: "melange-local-only",
      hostBinding: "127.0.0.1",
      createNetworkArgs: [
        "network",
        "create",
        "--driver",
        "bridge",
        "--opt",
        "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
        "melange-local-only",
      ],
      startArgs: ["start", "--network-id", "melange-local-only"],
    });
  });
});
