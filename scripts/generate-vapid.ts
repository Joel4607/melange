import { generateVAPIDKeys } from "web-push";
import fs from "node:fs";

const { publicKey, privateKey } = generateVAPIDKeys();
const envPath = ".env.local";
const subject = "mailto:hello@melange.app";

const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const lines: string[] = [];
if (!existing.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY")) {
  lines.push(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
}
if (!existing.includes("VAPID_PRIVATE_KEY")) {
  lines.push(`VAPID_PRIVATE_KEY=${privateKey}`);
}
if (!existing.includes("VAPID_SUBJECT")) {
  lines.push(`VAPID_SUBJECT=${subject}`);
}

if (lines.length) {
  fs.appendFileSync(envPath, `\n${lines.join("\n")}\n`);
}

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log("Keys written to .env.local");
console.log("Set VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY in your hosting environment.");
