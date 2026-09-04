import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const NETWORK_NAME = "melange-local-only";
const HOST_BINDING = "127.0.0.1";
const HOST_BINDING_OPTION = "com.docker.network.bridge.host_binding_ipv4";

function parseValue(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith('"') || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

function parseAssignments(source) {
  const assignments = new Map();
  let section = "";

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const sectionMatch = /^\[([^\]]+)]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    const assignment = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!assignment) continue;
    assignments.set(
      section ? `${section}.${assignment[1]}` : assignment[1],
      parseValue(assignment[2]),
    );
  }

  return assignments;
}

function isLoopbackUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const hostname = new URL(value).hostname.replace(/^\[|]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function durationSeconds(value) {
  if (typeof value !== "string") return Number.NaN;
  const match = /^(\d+)(s|m|h)$/.exec(value);
  if (!match) return Number.NaN;
  const multiplier = match[2] === "h" ? 3600 : match[2] === "m" ? 60 : 1;
  return Number(match[1]) * multiplier;
}

function sizeMiB(value) {
  if (typeof value !== "string") return Number.NaN;
  const match = /^(\d+(?:\.\d+)?)(KiB|MiB|GiB)$/.exec(value);
  if (!match) return Number.NaN;
  const amount = Number(match[1]);
  if (match[2] === "KiB") return amount / 1024;
  if (match[2] === "GiB") return amount * 1024;
  return amount;
}

export function auditSupabaseLocalConfig(source) {
  const config = parseAssignments(source);
  const errors = [];
  const requireSetting = (path, predicate, message) => {
    if (!predicate(config.get(path))) errors.push(message);
  };

  requireSetting(
    "auth.site_url",
    isLoopbackUrl,
    "auth.site_url must use a loopback host",
  );
  requireSetting(
    "auth.additional_redirect_urls",
    (value) => Array.isArray(value) && value.length > 0 && value.every(isLoopbackUrl),
    "auth.additional_redirect_urls must contain only loopback URLs",
  );
  requireSetting(
    "auth.minimum_password_length",
    (value) => typeof value === "number" && value >= 12,
    "auth.minimum_password_length must be at least 12",
  );
  requireSetting(
    "auth.password_requirements",
    (value) => typeof value === "string" && [
      "letters_digits",
      "lower_upper_letters_digits",
      "lower_upper_letters_digits_symbols",
    ].includes(value),
    "auth.password_requirements must require letters and digits",
  );
  requireSetting(
    "auth.email.secure_password_change",
    (value) => value === true,
    "auth.email.secure_password_change must be enabled",
  );
  requireSetting(
    "auth.email.max_frequency",
    (value) => durationSeconds(value) >= 60,
    "auth.email.max_frequency must be at least 60 seconds",
  );
  requireSetting(
    "auth.sms.enable_signup",
    (value) => value === false,
    "auth.sms.enable_signup must be disabled",
  );
  requireSetting(
    "auth.sms.twilio.enabled",
    (value) => value === false,
    "auth.sms.twilio.enabled must be disabled",
  );
  requireSetting(
    "storage.file_size_limit",
    (value) => sizeMiB(value) > 0 && sizeMiB(value) <= 10,
    "storage.file_size_limit must not exceed 10MiB",
  );
  requireSetting(
    "storage.s3_protocol.enabled",
    (value) => value === false,
    "storage.s3_protocol.enabled must be disabled",
  );
  requireSetting(
    "analytics.enabled",
    (value) => value === false,
    "analytics.enabled must be disabled",
  );

  return errors;
}

export function localSupabaseStartPlan() {
  return {
    networkName: NETWORK_NAME,
    hostBinding: HOST_BINDING,
    createNetworkArgs: [
      "network",
      "create",
      "--driver",
      "bridge",
      "--opt",
      `${HOST_BINDING_OPTION}=${HOST_BINDING}`,
      NETWORK_NAME,
    ],
    startArgs: ["start", "--network-id", NETWORK_NAME],
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
  });
  if (result.error) {
    throw new Error(`${command} could not be started: ${result.error.message}`);
  }
  return result;
}

function ensureLocalNetwork(plan) {
  const format = `{{ index .Options "${HOST_BINDING_OPTION}" }}`;
  const inspected = run("docker", [
    "network",
    "inspect",
    "--format",
    format,
    plan.networkName,
  ]);

  if (inspected.status !== 0) {
    const created = run("docker", plan.createNetworkArgs, { inherit: true });
    if (created.status !== 0) {
      throw new Error("Could not create the localhost-only Docker network.");
    }
    return;
  }

  if (inspected.stdout.trim() !== plan.hostBinding) {
    throw new Error(
      `Docker network ${plan.networkName} exists without the required ${plan.hostBinding} host binding. Remove or rename it manually before retrying.`,
    );
  }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const configPath = resolve(root, "supabase/config.toml");
  const errors = auditSupabaseLocalConfig(readFileSync(configPath, "utf8"));
  if (errors.length > 0) {
    throw new Error(`Unsafe local Supabase configuration:\n- ${errors.join("\n- ")}`);
  }

  if (process.argv[2] === "--check") {
    console.log("Local Supabase security policy passed.");
    return;
  }
  if (process.argv[2] !== "start") {
    throw new Error("Usage: node scripts/supabase-local-security.mjs start|--check");
  }

  const plan = localSupabaseStartPlan();
  ensureLocalNetwork(plan);
  const started = run("supabase", plan.startArgs, { inherit: true });
  if (started.status !== 0) {
    throw new Error("Supabase CLI failed to start the localhost-only stack.");
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
