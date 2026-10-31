"use client";

import { scoringPolicyLabel, type ScoringPolicy } from "@/domain/event-scoring";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { SubmissionDetails } from "@/components/SubmissionDetails";
import {
  JUDGING_POLICY,
  PRELIMINARY_SCORE_MAX,
  RUBRIC,
  RUBRIC_SCORE_MAX,
} from "@/domain/judging-policy";
import {
  formatNormalizedScore,
  NORMALIZATION_POLICY,
  type NormalizationDiagnostics,
} from "@/domain/normalization";
import type { ResultEntry, Submission } from "@/lib/types";
import type { PendingResultEntry } from "@/domain/results";
import { useCallback, useEffect, useMemo, useState } from "react";

type ResultsResponse = {
  results: ResultEntry[];
  pendingSubmissions: PendingResultEntry[];
  demoMode: boolean;
  normalization: NormalizationDiagnostics;
  scoringPolicy: ScoringPolicy;
  publishedAt: string;
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

export function ResultsView({
  hackathon,
  hackathonName,
  hackathonImageUrl,
}: {
  hackathon?: string;
  hackathonName?: string;
  hackathonImageUrl?: string;
}) {
  const apiBase = hackathon ? `/api/hackathons/${hackathon}` : "/api";
  const pageBase = hackathon ? `/${hackathon}` : "";
  const [name, setName] = useState("");
  const [role, setRole] = useState<"judge" | "admin">("judge");
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<PendingResultEntry[]>([]);
  const [search, setSearch] = useState("");
  const [normalization, setNormalization] =
    useState<NormalizationDiagnostics | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [scoringPolicy, setScoringPolicy] = useState<ScoringPolicy>("raw-v1");
  const [publishedAt, setPublishedAt] = useState("");
  const normalized = scoringPolicy === "normalized-v1";
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

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await fetch(`${apiBase}/results`);
        if (response.status === 401) {
          window.location.href = hackathon ? `/${hackathon}` : "/";
          return;
        }
        const data = (await response.json()) as ResultsResponse;
        if (!response.ok) throw new Error(data.error);
        setResults(data.results);
        setPendingSubmissions(data.pendingSubmissions);
        setNormalization(data.normalization);
        setScoringPolicy(data.scoringPolicy);
        setPublishedAt(data.publishedAt);
        setDemoMode(data.demoMode);
        setError("");
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Could not load results.",
        );
      } finally {
        setLoading(false);
      }
    },
    [apiBase, hackathon],
  );

  useEffect(() => {
    async function initialize() {
      const response = await fetch("/api/auth/session");
      if (!response.ok) {
        window.location.href = hackathon ? `/${hackathon}` : "/";
        return;
      }
      const session = (await response.json()) as {
        name: string;
        role: "judge" | "admin";
        hackathon?: string;
      };
      if (!hackathon && session.role === "judge") {
        window.location.href = session.hackathon
          ? `/${session.hackathon}/results`
          : "/";
        return;
      }
      if (
        hackathon &&
        session.role !== "admin" &&
        session.hackathon !== hackathon
      ) {
        window.location.href = `/${hackathon}`;
        return;
      }
      setName(session.name);
      setRole(session.role);
      await refresh();
    }
    void initialize();
    const interval = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(interval);
  }, [hackathon, refresh]);

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
        `${apiBase}/submission?id=${encodeURIComponent(id)}`,
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
      average: results.length
        ? Math.round((total / results.length) * 10) / 10
        : 0,
      judges: judges.size,
      highest: Math.max(0, ...results.map((result) => result.totalScore)),
    };
  }, [results]);

  const query = search.trim().toLocaleLowerCase();
  function matchesSearch(
    result: Pick<ResultEntry, "projectName" | "teamName" | "submitterNames" | "track" | "oneLiner">,
    judges = "",
  ) {
    return [
      result.projectName, result.teamName, result.submitterNames,
      result.track, result.oneLiner, judges,
    ].some((value) => value.toLocaleLowerCase().includes(query));
  }
  const orderedResults =
    normalized && showRaw
      ? [...results].sort((a, b) => a.rawRank - b.rawRank)
      : results;
  const displayedResults = orderedResults.filter((result) =>
    matchesSearch(result, result.reviews.map((review) => review.judgeName).join(" ")),
  );
  const displayedPending = pendingSubmissions.filter((result) => matchesSearch(result));

  if (!name || loading) return <LoadingScreen />;

  return (
    <AppShell
      hackathon={hackathon}
      hackathonImageUrl={hackathonImageUrl}
      hackathonName={hackathonName}
      name={name}
      role={role}
    >
      {demoMode && (
        <div className="demo-banner">
          Preview mode — add Airtable credentials to use live submissions.
        </div>
      )}

      <main className="workspace-main results-main">
        <section className="page-heading results-heading">
          <div>
            <span className="eyebrow">Submissions &amp; reviews</span>
            <h1>Results</h1>
            <p>Browse every submission, including projects awaiting reviews.</p>
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
            <span>Average raw score</span>
            <strong>
              {summary.average || "—"}
              <small>/{PRELIMINARY_SCORE_MAX}</small>
            </strong>
          </article>
          <article className="card">
            <span>Highest raw score</span>
            <strong>
              {summary.highest || "—"}
              <small>/{PRELIMINARY_SCORE_MAX}</small>
            </strong>
          </article>
          <article className="card">
            <span>Judges represented</span>
            <strong>{summary.judges}</strong>
          </article>
        </section>

        <div className="demo-banner">
          {scoringPolicyLabel(scoringPolicy)} · Fixed for this event
          {publishedAt
            ? ` · Published and locked ${formatCompleted(publishedAt)}`
            : " · Results remain provisional until published"}
        </div>
        {!normalized && (
          <p>
            This event retains its original scoring and tie-break rules.
            Normalization does not change its official results.
          </p>
        )}
        {normalized && (
          <section className="normalization-explanation card">
            <h2>Fairer judging</h2>
            <p>
              Rankings adjust for each judge’s average and scoring range, then
              average the three criteria and project reviews equally. Zero is
              neutral; higher is better. Original scores are preserved below.
            </p>
            <p>
              Small scoring histories are dampened toward neutral. A judge with
              one review, or identical scores for a criterion, contributes no
              relative preference for that criterion. Rankings remain
              provisional as reviews arrive or change.
            </p>
            <p>
              Judges should see comparable project mixes. Normalization cannot
              distinguish a generous judge from a judge assigned stronger
              projects. Existing final-round cohorts stay fixed until an
              organizer syncs or resets them.
            </p>
            {role === "admin" && normalization && (
              <details>
                <summary>
                  Judge calibration · {normalization.judges.length}{" "}
                  {normalization.judges.length === 1 ? "judge" : "judges"}
                </summary>
                {normalization.judgeGroups > 1 && (
                  <p role="status">
                    Judges form {normalization.judgeGroups} groups with no
                    shared projects between them. Comparisons across these
                    groups need organizer review.
                  </p>
                )}
                {normalization.missingReviewProjects > 0 && (
                  <p role="status">
                    {normalization.missingReviewProjects} completed projects
                    have no individual reviews. They receive a neutral
                    normalized score; restore their reviews before relying on
                    their ranks.
                  </p>
                )}
                <div className="results-table-scroll">
                  <table className="results-table">
                    <caption>
                      Preliminary reviews, including projects still awaiting
                      another review. Each criterion shows mean ± standard
                      deviation.
                    </caption>
                    <thead>
                      <tr>
                        <th>Judge</th>
                        <th>Reviews</th>
                        <th>Progress</th>
                        <th>Practicality</th>
                        <th>Complexity</th>
                        <th>Calibration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {normalization.judges.map((judge) => (
                        <tr key={judge.judgeName}>
                          <td>{judge.judgeName}</td>
                          <td>{judge.reviewCount}</td>
                          {(
                            [
                              "progressScore",
                              "practicalityScore",
                              "complexityScore",
                            ] as const
                          ).map((field) => (
                            <td key={field}>
                              {judge.criteria[field].mean.toFixed(1)} ±{" "}
                              {judge.criteria[field].standardDeviation.toFixed(
                                1,
                              )}
                            </td>
                          ))}
                          <td>
                            {judge.reviewCount <
                            NORMALIZATION_POLICY.lowSampleReviews
                              ? "Few reviews"
                              : "5+ reviews"}
                            {Object.values(judge.criteria).some(
                              (criterion) => criterion.standardDeviation === 0,
                            )
                              ? " · Flat criterion"
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>
        )}

        <label className="results-search">
          <span>Search results</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects, teams, builders, tracks, or judges"
          />
        </label>
        <p role="status">{displayedResults.length + displayedPending.length} of {results.length + pendingSubmissions.length} submissions</p>

        <section className="results-table-card card">
          <div className="section-header">
            <div>
              <h2>Judge scorecard</h2>
              <p>
                {!normalized
                  ? "Original totals and original tie-break rules, highest first."
                  : showRaw
                    ? "Raw comparison only. Official rankings use normalized scores."
                    : "Ordered by normalized score, highest first."}
              </p>
            </div>
            {normalized && (
              <button
                className="normalization-compare"
                type="button"
                aria-pressed={showRaw}
                onClick={() => setShowRaw((value) => !value)}
              >
                {showRaw ? "Show normalized ranking" : "Compare raw ranking"}
              </button>
            )}
          </div>

          {displayedResults.length ? (
            <div className="results-table-scroll">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Project &amp; team</th>
                    {normalized && (
                      <>
                        <th>Normalized</th>
                        <th>Raw rank</th>
                      </>
                    )}
                    <th>Builders</th>
                    <th>Judge</th>
                    <th>{RUBRIC.progress.label}</th>
                    <th>{RUBRIC.practicality.label}</th>
                    <th>{RUBRIC.complexity.label}</th>
                    <th>Raw total</th>
                    <th>Completed</th>
                    {role === "admin" && !publishedAt && <th>Admin</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayedResults.map((result) => (
                    <tr
                      aria-label={`Inspect ${result.projectName}`}
                      className="clickable-result-row"
                      key={result.id}
                      onClick={() => void inspectSubmission(result.id)}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          void inspectSubmission(result.id);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td>
                        <span className="result-rank">{orderedResults.indexOf(result) + 1}</span>
                      </td>
                      <td>
                        <div className="result-project">
                          <strong>{result.projectName}</strong>
                          <span>
                            {result.teamName} · {result.track}
                          </span>
                        </div>
                      </td>
                      {normalized && (
                        <>
                          <td>
                            <span className="result-total">
                              {formatNormalizedScore(result.normalizedScore)}
                            </span>
                          </td>
                          <td>#{result.rawRank}</td>
                        </>
                      )}
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
                              style={{
                                backgroundImage: `url("${result.teamPhotoUrl}")`,
                              }}
                            />
                          ) : (
                            <span className="builders-thumbnail fallback">
                              {(result.submitterNames || result.teamName)
                                .slice(0, 1)
                                .toUpperCase()}
                            </span>
                          )}
                          <span>
                            <strong>
                              {result.submitterNames || "Not provided"}
                            </strong>
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
                                <small>
                                  {review.totalScore}/{RUBRIC_SCORE_MAX}
                                </small>
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="rubric-score">
                          {result.progressScore}
                          <small>
                            /
                            {JUDGING_POLICY.score.max *
                              JUDGING_POLICY.preliminary.requiredReviews}
                          </small>
                        </span>
                      </td>
                      <td>
                        <span className="rubric-score">
                          {result.practicalityScore}
                          <small>
                            /
                            {JUDGING_POLICY.score.max *
                              JUDGING_POLICY.preliminary.requiredReviews}
                          </small>
                        </span>
                      </td>
                      <td>
                        <span className="rubric-score">
                          {result.complexityScore}
                          <small>
                            /
                            {JUDGING_POLICY.score.max *
                              JUDGING_POLICY.preliminary.requiredReviews}
                          </small>
                        </span>
                      </td>
                      <td>
                        <span className="result-total">
                          {result.totalScore}
                          <small>/{PRELIMINARY_SCORE_MAX}</small>
                        </span>
                      </td>
                      <td>
                        <span className="completed-time">
                          {formatCompleted(result.completedAt)}
                        </span>
                      </td>
                      {role === "admin" && !publishedAt && (
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
              <h3>{query ? "No matching scored projects" : "No completed scores yet"}</h3>
              <p>{query ? "Try another search." : "Finished judging sessions will appear here automatically."}</p>
            </div>
          )}
        </section>
        <section className="results-table-card card">
          <div className="section-header">
            <div>
              <h2>Awaiting reviews</h2>
              <p>Open any submission to view its project details. Rankings appear when reviews are complete.</p>
            </div>
          </div>
          {displayedPending.length ? (
            <div className="results-table-scroll">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Project &amp; team</th>
                    <th>Builders</th>
                    <th>Status</th>
                    <th>Reviews</th>
                    <th>Submission</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedPending.map((submission) => (
                    <tr
                      key={submission.id}
                      className="clickable-result-row"
                      onClick={() => void inspectSubmission(submission.id)}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          void inspectSubmission(submission.id);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Inspect ${submission.projectName}`}
                    >
                      <td>
                        <div className="result-project">
                          <strong>{submission.projectName}</strong>
                          <span>{submission.teamName} · {submission.track}</span>
                        </div>
                      </td>
                      <td>{submission.submitterNames || "Not provided"}</td>
                      <td>{submission.status === "in progress" ? "Review in progress" : submission.reviewCount ? "Awaiting another review" : "Not reviewed"}</td>
                      <td>{submission.reviewCount}/{JUDGING_POLICY.preliminary.requiredReviews}</td>
                      <td>
                        <button
                          type="button"
                          className="inspect-session"
                          onClick={(event) => {
                            event.stopPropagation();
                            void inspectSubmission(submission.id);
                          }}
                        >
                          View submission
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel-empty">
              <h3>{query ? "No matching pending submissions" : "No submissions awaiting reviews"}</h3>
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
                <>
                  {role === "admin" && (
                    <section className="results-review-actions" aria-label="Edit submission scores">
                      <h2>Judge scores</h2>
                      {publishedAt ? (
                        <p>Published results are locked.</p>
                      ) : inspectedSubmission.status === "in progress" ? (
                        <p>Release the active judging session from the dashboard before editing scores.</p>
                      ) : inspectedSubmission.reviews.length ? inspectedSubmission.reviews.map((review, index) => (
                          <a
                            className="submission-inspection-judge-link"
                            key={`${review.judgeName}-${index}`}
                            href={`${pageBase}/judging?submission=${encodeURIComponent(inspectedSubmission.id)}&review=${index}`}
                          >
                            Edit {review.judgeName || "Unknown judge"}’s scores · {review.totalScore}/{RUBRIC_SCORE_MAX}
                          </a>
                        )) : (
                          <p>No scores yet. This submission is awaiting its first review.</p>
                        )}
                    </section>
                  )}
                  <SubmissionDetails submission={inspectedSubmission} />
                </>
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
                  href={`${pageBase}/judging?submission=${encodeURIComponent(
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
                      {RUBRIC.progress.label}{" "}
                      <strong>{review.progressScore}</strong>
                    </span>
                    <span>
                      {RUBRIC.practicality.label}{" "}
                      <strong>{review.practicalityScore}</strong>
                    </span>
                    <span>
                      {RUBRIC.complexity.label}{" "}
                      <strong>{review.complexityScore}</strong>
                    </span>
                  </span>
                  <span className="review-picker-total">
                    <strong>{review.totalScore}</strong>
                    <small>/{RUBRIC_SCORE_MAX}</small>
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
              <span>
                {selectedTeam.teamName} · {selectedTeam.projectName}
              </span>
              <strong>{selectedTeam.submitterNames || "Builders"}</strong>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
