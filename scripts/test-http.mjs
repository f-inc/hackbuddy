import assert from "node:assert/strict";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const base = process.env.HACKBUDDY_TEST_URL || "http://localhost:3010";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("HTTP smoke checks require a local server.");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {}
  await pause(500);
}
assert.ok(ready, "Local HackBuddy server did not become ready.");
for (const path of ["/api/auth/session", "/api/hackathons"]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 401, `${path} must require sign-in`);
}
const redirect = await fetch(base + "/studio", { redirect: "manual" });
assert.ok([307, 308].includes(redirect.status));
assert.equal(new URL(redirect.headers.get("location"), base).pathname, "/hackathons");
async function signIn(password) {
  return fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ name: "release-check", password }),
  });
}
const invalid = await signIn("invalid-smoke-check-password");
assert.equal(invalid.status, 401);
assert.ok(process.env.ADMIN_PASSWORD, "Configure ADMIN_PASSWORD for the local HTTP check.");
const login = await signIn(process.env.ADMIN_PASSWORD);
assert.equal(login.status, 200);
assert.equal((await login.json()).role, "admin");
const setCookie = login.headers.get("set-cookie");
assert.ok(setCookie?.includes("HttpOnly"));
const cookie = setCookie.split(";")[0];
const session = await fetch(base + "/api/auth/session", { headers: { Cookie: cookie } });
assert.equal(session.status, 200);
assert.equal((await session.json()).role, "admin");
console.log(
  "HTTP smoke checks passed: unified app redirect, authentication gates, normal admin sign-in and session.",
);
