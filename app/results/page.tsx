"use client";

import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { SubmissionDetails } from "@/components/SubmissionDetails";
import type { ResultEntry, Submission } from "@/lib/types";
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
  const [reviewPickerProject, setReviewPickerProject] =
    useState<ResultEntry | null>(null);
  const [inspectedSubmission, setInspectedSubmission] =
    useState<Submission | null>(null);
  const [inspectingId, setInspectingId] = useState("");
  const [inspectionError, setInspectionError] = useState("");
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
    if (!selectedTeam && !reviewPickerProject && !inspectingId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedTeam(null);
        setReviewPickerProject(null);
        setInspectedSubmission(null);
        setInspectingId("");
        setInspectionError("");
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [inspectingId, reviewPickerProject, selectedTeam]);

  async function inspectSubmission(id: string) {
    setInspectingId(id);
    setInspectedSubmission(null);
    setInspectionError("");
    try {
      const response = await fetch(
        `/api/submission?id=${encodeURIComponent(id)}`,
      );
      const data = (await response.json()) as {
        submission?: Submission;
        error?: string;
      };
      if (!response.ok || !data.submission) {
        throw new Error(data.error || "Could not load this submission.");
      }
      setInspectedSubmission(data.submission);
    } catch (caught) {
      setInspectionError(
        caught instanceof Error
          ? caught.message
          : "Could not load this submission.",
      );
    }
  }

  function closeInspection() {
    setInspectedSubmission(null);
    setInspectingId("");
    setInspectionError("");
  }

  const summary = useMemo(() => {
    const total = results.reduce((sum, result) => sum + result.totalScore, 0);
    const judges = new Set(
      results.flatMap((result) =>
        result.reviews.map((review) => review.judgeName),
      ),
    );
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
            <strong>{summary.average || "—"}<small>/60</small></strong>
          </article>
          <article className="card">
            <span>Highest score</span>
            <strong>{summary.highest || "—"}<small>/60</small></strong>
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
                    {role === "admin" && <th>Admin</th>}
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr
                      aria-label={`Inspect ${result.projectName}`}
                      className="clickable-result-row"
                      key={result.id}
                      onClick={() => void inspectSubmission(result.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void inspectSubmission(result.id);
                        }
                      }}
                      tabIndex={0}
                    >
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
                          onClick={(event) => {
                            event.stopPropagation();
                            if (result.teamPhotoUrl) setSelectedTeam(result);
                          }}
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
                        <div className="result-judges">
                          {result.reviews.map((review) => (
                            <div key={`${result.id}-${review.judgeName}`}>
                              <span className="judge-chip">
                                {review.judgeName.slice(0, 1).toUpperCase()}
                              </span>
                              <span>
                                <strong className="judge-name">
                                  {review.judgeName || "Unknown"}
                                </strong>
                                <small>{review.totalScore}/30</small>
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td><span className="rubric-score">{result.progressScore}<small>/20</small></span></td>
                      <td><span className="rubric-score">{result.practicalityScore}<small>/20</small></span></td>
                      <td><span className="rubric-score">{result.complexityScore}<small>/20</small></span></td>
                      <td><span className="result-total">{result.totalScore}<small>/60</small></span></td>
                      <td><span className="completed-time">{formatCompleted(result.completedAt)}</span></td>
                      {role === "admin" && (
                        <td>
                          <button
                            className="inspect-session"
                            onClick={(event) => {
                              event.stopPropagation();
                              setReviewPickerProject(result);
                            }}
                            type="button"
                          >
                            Edit
                          </button>
                        </td>
                      )}
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

      {inspectingId && (
        <div
          aria-label="Submission preview"
          aria-modal="true"
          className="submission-inspection-modal"
          onClick={closeInspection}
          role="dialog"
        >
          <div
            className="submission-inspection-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="submission-inspection-header">
              <div>
                <span className="eyebrow">Submission preview</span>
                <strong>
                  {inspectedSubmission?.projectName || "Loading project…"}
                </strong>
              </div>
              <button
                aria-label="Close submission preview"
                onClick={closeInspection}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="submission-inspection-body">
              {inspectedSubmission ? (
                <SubmissionDetails submission={inspectedSubmission} />
              ) : inspectionError ? (
                <div className="panel-empty">
                  <span>!</span>
                  <h3>Could not open this submission</h3>
                  <p>{inspectionError}</p>
                </div>
              ) : (
                <div className="submission-inspection-loading">
                  <span className="spinner" />
                  <p>Loading submission…</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {reviewPickerProject && (
        <div
          aria-labelledby="review-picker-title"
          aria-modal="true"
          className="review-picker-modal"
          onClick={() => setReviewPickerProject(null)}
          role="dialog"
        >
          <section
            className="review-picker-card"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">Administrator controls</span>
                <h2 id="review-picker-title">Choose a judge’s review</h2>
                <p>
                  Select the submitted answers you want to inspect or correct
                  for <strong>{reviewPickerProject.projectName}</strong>.
                </p>
              </div>
              <button
                aria-label="Close review picker"
                className="review-picker-close"
                onClick={() => setReviewPickerProject(null)}
                type="button"
              >
                ×
              </button>
            </header>

            <div className="review-picker-list">
              {reviewPickerProject.reviews.map((review, index) => (
                <a
                  className="review-picker-option"
                  href={`/judging?submission=${encodeURIComponent(
                    reviewPickerProject.id,
                  )}&review=${index}`}
                  key={`${reviewPickerProject.id}-${review.judgeName}-${index}`}
                >
                  <span className="review-picker-avatar">
                    {review.judgeName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="review-picker-judge">
                    <small>Review {index + 1}</small>
                    <strong>{review.judgeName || "Unknown judge"}</strong>
                  </span>
                  <span className="review-picker-breakdown">
                    <span>
                      Progress <strong>{review.progressScore}</strong>
                    </span>
                    <span>
                      Practicality <strong>{review.practicalityScore}</strong>
                    </span>
                    <span>
                      Complexity <strong>{review.complexityScore}</strong>
                    </span>
                  </span>
                  <span className="review-picker-total">
                    <strong>{review.totalScore}</strong>
                    <small>/30</small>
                  </span>
                  <span className="review-picker-arrow" aria-hidden>
                    →
                  </span>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}

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
