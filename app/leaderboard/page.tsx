"use client";

import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { FinalistEntry, FinalsState } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

type FinalsResponse = {
  finals: FinalsState;
  error?: string;
};

export default function LeaderboardPage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"judge" | "admin">("judge");
  const [finals, setFinals] = useState<FinalsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [presenting, setPresenting] = useState(false);
  const [showAllFinalists, setShowAllFinalists] = useState(false);
  const [selectedFinalist, setSelectedFinalist] =
    useState<FinalistEntry | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/finals");
      if (response.status === 401) {
        window.location.href = "/";
        return;
      }
      const data = (await response.json()) as FinalsResponse;
      if (!response.ok) throw new Error(data.error);
      setFinals(data.finals);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the leaderboard.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      const response = await fetch("/api/auth/session");
      if (!response.ok) {
        window.location.href = "/";
        return;
      }
      const session = (await response.json()) as {
        name: string;
        role: "judge" | "admin";
      };
      setName(session.name);
      setRole(session.role);
      await refresh();
    }

    void initialize();
    const interval = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    function syncFullscreenState() {
      if (!document.fullscreenElement) setPresenting(false);
    }
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!selectedFinalist) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedFinalist(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedFinalist]);

  async function togglePresentation() {
    if (presenting) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setPresenting(false);
      return;
    }

    setPresenting(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // The fixed presentation layout still works if fullscreen is unavailable.
    }
  }

  async function startFinals() {
    const confirmed = window.confirm(
      `Start final judging with ${finals?.judges.length ?? 0} judges? This freezes the current Top 10 and judge roster.`,
    );
    if (!confirmed) return;
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/finals", { method: "POST" });
      const data = (await response.json()) as FinalsResponse;
      if (!response.ok) throw new Error(data.error);
      setFinals(data.finals);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not start finals.",
      );
    } finally {
      setStarting(false);
    }
  }

  if (!name || loading || !finals) return <LoadingScreen />;

  const finalState = finals;
  const results =
    finalState.allComplete && !showAllFinalists
      ? finalState.topThree
      : finalState.finalists;
  const heading = finalState.allComplete
    ? showAllFinalists
      ? "Final judging"
      : "Top 3 finalists"
    : "Top 10 teams";

  function finalistContent(result: FinalistEntry) {
    return (
      <>
        <div className="tv-project">
          <strong>{result.projectName}</strong>
          <span>{result.teamName}</span>
        </div>
        <div className="tv-builders">
          {result.teamPhotoUrl ? (
            <span
              aria-haspopup="dialog"
              aria-label={`View ${result.teamName} team photo`}
              className="tv-team-photo has-photo"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSelectedFinalist(result);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                setSelectedFinalist(result);
              }}
              role="button"
              style={{
                backgroundImage: `url("${result.teamPhotoUrl}")`,
              }}
              tabIndex={0}
            />
          ) : (
            <span className="tv-team-photo fallback">
              {(result.submitterNames || result.teamName)
                .slice(0, 1)
                .toUpperCase()}
            </span>
          )}
          <span className="tv-builders-copy">
            <small>Built by</small>
            <strong>{result.submitterNames || result.teamName}</strong>
          </span>
        </div>
        {finalState.started && (
          <span
            className={`final-review-status${
              result.reviewedByYou ? " complete" : ""
            }`}
          >
            {!finalState.eligibleJudge
              ? "View only"
              : result.reviewedByYou
                ? "✓ Reviewed"
                : "Judge team"}
          </span>
        )}
      </>
    );
  }

  const board = (
    <main
      className={`tv-leaderboard${presenting ? " is-presenting" : ""}`}
      id="top-ten-leaderboard"
    >
      <header className="tv-leaderboard-header">
        <div className="tv-leaderboard-title">
          <span aria-hidden className="brand-mark small" />
          <div>
            <span className="eyebrow">Night Hack III</span>
            <h1>{heading}</h1>
          </div>
        </div>
        <div className="tv-leaderboard-actions">
          <span className="results-live">
            <span />
            Live · refreshes every 30 seconds
          </span>
          <button
            className="secondary-button tv-present-button"
            onClick={togglePresentation}
            type="button"
          >
            {presenting ? "Exit presentation" : "Present on TV"}
            <span aria-hidden>{presenting ? "↙" : "↗"}</span>
          </button>
          {finalState.allComplete && !presenting && (
            <button
              className="secondary-button tv-present-button"
              onClick={() => setShowAllFinalists((current) => !current)}
              type="button"
            >
              {showAllFinalists ? "Show top 3" : "Review all finalists"}
            </button>
          )}
          {!finalState.started && role === "admin" && (
            <button
              className="primary-button tv-start-button"
              disabled={starting || !finalState.canStart}
              onClick={startFinals}
              type="button"
            >
              {starting ? "Starting…" : "Start final judging"}
              {!starting && <span aria-hidden>→</span>}
            </button>
          )}
        </div>
      </header>

      {error && <div className="error-banner page-error">{error}</div>}

      <section className="final-round-status">
        <div>
          <span
            className={`final-round-dot${finalState.started ? " live" : ""}`}
          />
          <strong>
            {finalState.started
              ? finalState.allComplete
                ? "Final judging complete"
                : "Final judging is live"
              : "Final judging has not started"}
          </strong>
        </div>
        <p>
          {finalState.started
            ? `${finalState.completedReviews} of ${finalState.requiredReviews} judge reviews completed across ${finalState.judges.length} judges.`
            : role === "admin"
              ? finalState.canStart
                ? `Starting will freeze these teams and include ${finalState.judges.length} preliminary judges.`
                : "Final judging becomes available as soon as 10 teams have completed preliminary scoring."
              : "An administrator will start the final round when presentations begin."}
        </p>
      </section>

      {results.length ? (
        <ol className="tv-ranking">
          {results.map((result) => (
            <li
              className={result.reviewedByYou ? "reviewed-by-you" : ""}
              key={result.id}
            >
              {finalState.started && finalState.eligibleJudge ? (
                <a
                  className="tv-finalist-card"
                  href={`/judging?submission=${encodeURIComponent(
                    result.id,
                  )}&final=1`}
                >
                  {finalistContent(result)}
                </a>
              ) : (
                <div className="tv-finalist-card">
                  {finalistContent(result)}
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <section className="tv-empty card">
          <span>★</span>
          <h2>Results are coming</h2>
          <p>The top 10 will appear as projects finish both reviews.</p>
        </section>
      )}

      <footer className="tv-leaderboard-footer">
        <span>HackBuddy</span>
        <span>
          {finalState.allComplete && !showAllFinalists
            ? "3 finalists selected by the full judging panel"
            : `${results.length} finalist teams shown`}
        </span>
      </footer>
    </main>
  );

  return (
    <AppShell name={name} role={role}>
      {board}
      {selectedFinalist?.teamPhotoUrl && (
        <div
          aria-labelledby="leaderboard-photo-title"
          aria-modal="true"
          className="photo-modal leaderboard-photo-modal"
          onClick={() => setSelectedFinalist(null)}
          role="dialog"
        >
          <div
            className="photo-modal-content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Close photo"
              className="photo-modal-close"
              onClick={() => setSelectedFinalist(null)}
              type="button"
            >
              ×
            </button>
            <div
              aria-label={`${selectedFinalist.teamName} team photo`}
              className="photo-modal-image"
              role="img"
              style={{
                backgroundImage: `url("${selectedFinalist.teamPhotoUrl}")`,
              }}
            />
            <div className="photo-modal-caption">
              <span>
                {selectedFinalist.teamName} · {selectedFinalist.projectName}
              </span>
              <strong id="leaderboard-photo-title">
                {selectedFinalist.submitterNames || "Builders"}
              </strong>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
