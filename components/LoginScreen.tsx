"use client";

import { FormEvent, useEffect, useState } from "react";

type LoginScreenProps = {
  hackathon?: string;
  hackathonName?: string;
};

export function LoginScreen({
  hackathon,
  hackathonName,
}: LoginScreenProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session").then(async (response) => {
      if (!response.ok) return;
      const session = (await response.json()) as {
        role: "judge" | "admin";
        hackathon?: string;
      };
      if (!hackathon && session.role === "admin") {
        window.location.href = "/hackathons";
      } else if (!hackathon && session.hackathon) {
        window.location.href = `/${session.hackathon}/dashboard`;
      } else if (
        hackathon &&
        (session.role === "admin" || session.hackathon === hackathon)
      ) {
        window.location.href = `/${hackathon}/dashboard`;
      }
    });
  }, [hackathon]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.toLowerCase(),
          password,
          hackathon,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };
      if (!response.ok) throw new Error(result.error);
      window.location.href =
        result.redirectTo || (hackathon ? `/${hackathon}/dashboard` : "/hackathons");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not sign you in.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand">
          <span aria-hidden className="brand-mark" />
          <span>HackBuddy</span>
        </div>

        <div className="login-copy">
          <h1>Hackathon judging, simplified.</h1>
          <p>
            Pick up the newest submission, score it consistently, and keep the
            entire event moving from one shared workspace.
          </p>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="auth-card" onSubmit={submit}>
          <div>
            <h2>
              Sign in{hackathonName ? ` to ${hackathonName}` : " to HackBuddy"}
            </h2>
            <p>Use your name and the password for your event role.</p>
          </div>

          <label className="field">
            <span>Your name</span>
            <input
              autoCapitalize="none"
              autoComplete="username"
              onChange={(event) => setName(event.target.value.toLowerCase())}
              placeholder="e.g. maya chen"
              required
              value={name}
            />
            <small className="field-hint">Names are stored in lowercase.</small>
          </label>

          <label className="field">
            <span>Event or admin password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter the shared password"
              required
              type="password"
              value={password}
            />
          </label>

          {error && <div className="error-banner">{error}</div>}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Continue"}
            {!loading && <span aria-hidden>→</span>}
          </button>
        </form>
      </section>
    </main>
  );
}
