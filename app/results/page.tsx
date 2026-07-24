"use client";

import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { ResultEntry } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type ResultsResponse = {
  results: ResultEntry[];
  demoMode: boolean;
  error?: string;
};

function formatCompleted(value: string) {
  if (!value) return "Recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ResultsPage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"judge" | "admin">("judge");
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<ResultEntry | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/results");
      if (response.status === 401) {
        window.location.href = "/";
        return;
      }
      const data = (await response.json()) as ResultsResponse;
      if (!response.ok) throw new Error(data.error);
      setResults(data.results);
      setDemoMode(data.demoMode);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load results.",
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
    if (!selectedTeam) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedTeam(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [selectedTeam]);

  const summary = useMemo(() => {
    const total = results.reduce((sum, result) => sum + result.totalScore, 0);
    const judges = new Set(results.map((result) => result.judgeName).filter(Boolean));
    return {
      average: results.length ? Math.round((total / results.length) * 10) / 10 : 0,
      judges: judges.size,
      highest: results[0]?.totalScore ?? 0,
    };
  }, [results]);

  if (!name || loading) return <LoadingScreen />;

  return (
    <AppShell name={name} role={role}>
      {demoMode && (
        <div className="demo-banner">
          Preview mode — add Airtable credentials to use live submissions.
        </div>
      )}

      <main className="workspace-main results-main">
        <section className="page-heading results-heading">
          <div>
            <span className="eyebrow">Completed reviews</span>
            <h1>Results</h1>
            <p>Every completed score, judge, team, and builder in one place.</p>
          </div>
          <span className="results-live">
            <span />
            Refreshes every 30 seconds
          </span>
        </section>

        {error && <div className="error-banner page-error">{error}</div>}

        <section className="results-summary" aria-label="Results summary">
          <article className="card">
            <span>Scored projects</span>
            <strong>{results.length}</strong>
          </article>
          <article className="card">
            <span>Average score</span>
            <strong>{summary.average || "—"}<small>/30</small></strong>
          </article>
          <article className="card">
            <span>Highest score</span>
            <strong>{summary.highest || "—"}<small>/30</small></strong>
          </article>
          <article className="card">
            <span>Judges represented</span>
            <strong>{summary.judges}</strong>
          </article>
        </section>

        <section className="results-table-card card">
          <div className="section-header">
            <div>
              <h2>Judge scorecard</h2>
              <p>Ordered by total score, highest first.</p>
            </div>
            <span className="results-count">{results.length} completed</span>
          </div>

          {results.length ? (
            <div className="results-table-scroll">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Project &amp; team</th>
                    <th>Builders</th>
                    <th>Judge</th>
                    <th>Progress</th>
                    <th>Practicality</th>
                    <th>Complexity</th>
                    <th>Total</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={result.id}>
                      <td>
                        <span className="result-rank">{index + 1}</span>
                      </td>
                      <td>
                        <div className="result-project">
                          <strong>{result.projectName}</strong>
                          <span>{result.teamName} · {result.track}</span>
                        </div>
                      </td>
                      <td>
                        <button
                          className={`builders-cell${result.teamPhotoUrl ? " has-photo" : ""}`}
                          disabled={!result.teamPhotoUrl}
                          onClick={() => result.teamPhotoUrl && setSelectedTeam(result)}
                          type="button"
                        >
                          {result.teamPhotoUrl ? (
                            <span
                              className="builders-thumbnail"
                              style={{ backgroundImage: `url("${result.teamPhotoUrl}")` }}
                            />
                          ) : (
                            <span className="builders-thumbnail fallback">
                              {(result.submitterNames || result.teamName)
                                .slice(0, 1)
                                .toUpperCase()}
                            </span>
                          )}
                          <span>
                            <strong>{result.submitterNames || "Not provided"}</strong>
                            {result.teamPhotoUrl && <small>View photo</small>}
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="judge-chip">
                          {result.judgeName.slice(0, 1).toUpperCase()}
                        </span>
                        <strong className="judge-name">
                          {result.judgeName || "Unknown"}
                        </strong>
                      </td>
                      <td><span className="rubric-score">{result.progressScore}<small>/10</small></span></td>
                      <td><span className="rubric-score">{result.practicalityScore}<small>/10</small></span></td>
                      <td><span className="rubric-score">{result.complexityScore}<small>/10</small></span></td>
                      <td><span className="result-total">{result.totalScore}<small>/30</small></span></td>
                      <td><span className="completed-time">{formatCompleted(result.completedAt)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel-empty">
              <span>—</span>
              <h3>No completed scores yet</h3>
              <p>Finished judging sessions will appear here automatically.</p>
            </div>
          )}
        </section>
      </main>

      {selectedTeam?.teamPhotoUrl && (
        <div
          aria-label={`${selectedTeam.teamName} builder photo`}
          aria-modal="true"
          className="photo-modal"
          onClick={() => setSelectedTeam(null)}
          role="dialog"
        >
          <div
            className="photo-modal-content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Close photo"
              className="photo-modal-close"
              onClick={() => setSelectedTeam(null)}
              type="button"
            >
              ×
            </button>
            <div
              className="photo-modal-image"
              role="img"
              style={{ backgroundImage: `url("${selectedTeam.teamPhotoUrl}")` }}
            />
            <div className="photo-modal-caption">
              <span>{selectedTeam.teamName} · {selectedTeam.projectName}</span>
              <strong>{selectedTeam.submitterNames || "Builders"}</strong>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
