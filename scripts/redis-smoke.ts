// One-off live smoke test for the Redis layer (not part of the app).
import { redis } from "../src/lib/server/redis";
import {
  clearRunnerPresence,
  liveRunnerLocations,
  publishRunnerLocation,
} from "../src/lib/server/presence";
import { withinRateLimit } from "../src/lib/server/rate-limit";

async function main() {
  console.log("PING ->", await redis(["PING"]));

  const id = "smoke-runner";
  console.log("publish ->", await publishRunnerLocation(id, 5.611, -0.18));
  console.log("publish again ->", await publishRunnerLocation(id, 5.612, -0.181));
  const live = await liveRunnerLocations([id, "missing-runner"]);
  console.log("live ->", [...live.entries()]);
  await clearRunnerPresence(id);
  console.log("after clear ->", [...(await liveRunnerLocations([id])).entries()]);

  const hits: boolean[] = [];
  for (let i = 0; i < 7; i++) hits.push(await withinRateLimit("smoke", "u1", 5, 60));
  console.log("rate limit (5/60s, 7 hits) ->", hits.join(","));
  await redis(["DEL", `rl:smoke:u1:${Math.floor(Date.now() / 1000 / 60)}`]);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
