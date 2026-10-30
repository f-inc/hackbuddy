"use client";

import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ScoreControl } from "@/components/ScoreControl";
import { SubmissionDetails } from "@/components/SubmissionDetails";
import {
  JUDGING_POLICY,
  RUBRIC,
  RUBRIC_SCORE_MAX,
} from "@/domain/judging-policy";
import type {
  FinalsState,
  QueueStats,
  Submission,
  SubmissionReview,
} from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

type ClaimResponse = {
  submission: Submission | null;
  stats: QueueStats;
  demoMode: boolean;
  error?: string;
};

type FinalSubmissionResponse = ClaimResponse & {
  existingReview: SubmissionReview | null;
  finals: FinalsState;
};

function formatSubmitted(value: string) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function JudgingView({
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
  const [inspectionMode, setInspectionMode] = useState(false);
  const [finalMode, setFinalMode] = useState(false);
  const [editingFinalReview, setEditingFinalReview] = useState(false);
  const [finalsState, setFinalsState] = useState<FinalsState | null>(null);
  const [editingReviewIndex, setEditingReviewIndex] = useState<number | null>(
    null,
  );
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [progress, setProgress] = useState(0);
  const [practicality, setPracticality] = useState(0);
  const [complexity, setComplexity] = useState(0);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [completedNow, setCompletedNow] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionState, setTransitionState] = useState<
    "idle" | "saving" | "success" | "exiting"
  >("idle");
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    document.body.classList.add("judging-scroll-lock");
    return () => document.body.classList.remove("judging-scroll-lock");
  }, []);

  const claim = useCallback(
    async (showFullPageLoader = false) => {
      if (showFullPageLoader) setLoading(true);
      setError("");
      try {
        const response = await fetch(`${apiBase}/queue/claim`, {
          method: "POST",
        });
        if (response.status === 401) {
          window.location.href = hackathon ? `/${hackathon}` : "/";
          return;
        }
        const result = (await response.json()) as ClaimResponse;
        if (!response.ok) throw new Error(result.error);
        setSubmission(result.submission);
        setStats(result.stats);
        setDemoMode(result.demoMode);
        setProgress(0);
        setPracticality(0);
        setComplexity(0);
        setNotes("");
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load the queue.",
        );
      } finally {
        if (showFullPageLoader) setLoading(false);
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
          ? `/${session.hackathon}/judging`
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

      const searchParams = new URLSearchParams(window.location.search);
      const submissionId = searchParams.get("submission");
      const isFinalMode = searchParams.get("final") === "1";
      const reviewParam = searchParams.get("review");
      const selectedReviewIndex =
        reviewParam !== null && /^\d+$/.test(reviewParam)
          ? Number(reviewParam)
          : null;
      if (isFinalMode) {
        window.location.replace(`${pageBase}/leaderboard`);
        return;
      }
      if (isFinalMode && submissionId) {
        setFinalMode(true);
        setLoading(true);
        const finalResponse = await fetch(
          `${apiBase}/finals?id=${encodeURIComponent(submissionId)}`,
        );
        const result = (await finalResponse.json()) as FinalSubmissionResponse;
        if (!finalResponse.ok) {
          setError(result.error || "Could not load this finalist.");
          setLoading(false);
          return;
        }
        setSubmission(result.submission);
        setStats(result.stats);
        setFinalsState(result.finals);
        setDemoMode(result.demoMode);
        if (result.existingReview) {
          setEditingFinalReview(true);
          setProgress(result.existingReview.progressScore);
          setPracticality(result.existingReview.practicalityScore);
          setComplexity(result.existingReview.complexityScore);
          setNotes(result.existingReview.notes);
        }
        setLoading(false);
        return;
      }
      if (session.role === "admin" && submissionId) {
        setInspectionMode(true);
        setEditingReviewIndex(selectedReviewIndex);
        setLoading(true);
        const inspectionResponse = await fetch(
          `${apiBase}/admin/submission?id=${encodeURIComponent(submissionId)}${
            selectedReviewIndex !== null ? `&review=${selectedReviewIndex}` : ""
          }`,
        );
        const result = (await inspectionResponse.json()) as ClaimResponse;
        if (!inspectionResponse.ok) {
          setError(result.error || "Could not load this judging session.");
          setLoading(false);
          return;
        }
        setSubmission(result.submission);
        setStats(result.stats);
        setDemoMode(result.demoMode);
        if (
          selectedReviewIndex !== null &&
          result.submission?.reviews[selectedReviewIndex]
        ) {
          const selectedReview = result.submission.reviews[selectedReviewIndex];
          setProgress(selectedReview.progressScore);
          setPracticality(selectedReview.practicalityScore);
          setComplexity(selectedReview.complexityScore);
          setNotes(selectedReview.notes);
        }
        setLoading(false);
        return;
      }

      await claim(true);
    }
    void initialize();
  }, [apiBase, claim, hackathon, pageBase]);

  useEffect(() => {
    if (!name || finalMode) return;

    async function refreshCollectiveProgress() {
      const response = await fetch(`${apiBase}/dashboard`);
      if (!response.ok) return;
      const result = (await response.json()) as { stats: QueueStats };
      setStats(result.stats);
    }

    const interval = window.setInterval(
      () => void refreshCollectiveProgress(),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, [apiBase, finalMode, name]);

  async function submitScore() {
    if (!submission || !progress || !practicality || !complexity) {
      setError("Choose a score for all three rubric categories.");
      return;
    }

    setSubmitting(true);
    setTransitioning(true);
    setTransitionState("saving");
    setError("");
    try {
      const response = await fetch(`${apiBase}/queue/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: submission.id,
          progress,
          practicality,
          complexity,
          notes,
        }),
      });
      const result = (await response.json()) as ClaimResponse & {
        ok?: boolean;
      };
      if (!response.ok) throw new Error(result.error);
      setTransitionState("success");
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      setCompletedNow((count) => count + 1);
      setSubmission(result.submission);
      setStats(result.stats);
      setDemoMode(result.demoMode);
      setProgress(0);
      setPracticality(0);
      setComplexity(0);
      setNotes("");
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      setTransitioning(false);
      await new Promise((resolve) => window.setTimeout(resolve, 240));
      setTransitionState("exiting");
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      setTransitionState("idle");
    } catch (caught) {
      setTransitionState("idle");
      setTransitioning(false);
      setError(
        caught instanceof Error ? caught.message : "Could not save the score.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function releaseSession() {
    if (!submission) return;
    setReleasing(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/admin/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submission.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      window.location.href = `${pageBase}/dashboard`;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not release this submission.",
      );
      setReleasing(false);
    }
  }

  async function updateSelectedReview() {
    if (!submission || !progress || !practicality || !complexity) {
      setError("Choose a score for all three rubric categories.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/admin/submission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: submission.id,
          reviewIndex: editingReviewIndex,
          progress,
          practicality,
          complexity,
          notes,
        }),
      });
      const result = (await response.json()) as ClaimResponse & {
        ok?: boolean;
      };
      if (!response.ok) throw new Error(result.error);
      window.location.href = `${pageBase}/results`;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update the review.",
      );
      setSubmitting(false);
    }
  }

  async function submitFinalScore() {
    if (!submission || !progress || !practicality || !complexity) {
      setError("Choose a score for all three rubric categories.");
      return;
    }

    setSubmitting(true);
    setTransitioning(true);
    setTransitionState("saving");
    setError("");
    try {
      const response = await fetch(`${apiBase}/finals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: submission.id,
          progress,
          practicality,
          complexity,
          notes,
        }),
      });
      const result = (await response.json()) as {
        finals?: FinalsState;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error);
      setTransitionState("success");
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      window.location.href = `${pageBase}/leaderboard`;
    } catch (caught) {
      setTransitionState("idle");
      setTransitioning(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save the final score.",
      );
      setSubmitting(false);
    }
  }

  if (!name || loading) return <LoadingScreen />;

  const reviewed = finalMode
    ? (finalsState?.finalists.filter((finalist) => finalist.reviewedByYou)
        .length ?? 0)
    : (stats?.completed ?? 0);
  const total = finalMode
    ? (finalsState?.finalists.length ?? JUDGING_POLICY.finals.finalistCount)
    : (stats?.total ?? 0);
  const totalScore = progress + practicality + complexity;
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

      <main className="workspace-main judging-main">
        <section className="workspace-toolbar compact-toolbar">
          <div>
            {(inspectionMode || finalMode) && (
              <span className="eyebrow">
                {finalMode
                  ? "Final-round presentation"
                  : editingReviewIndex !== null
                    ? "Administrator score editor"
                    : "Administrator session view"}
              </span>
            )}
            <h1>
              {finalMode
                ? "Judge finalist"
                : editingReviewIndex !== null
                  ? "Inspect submitted score"
                  : inspectionMode
                    ? "Inspect judging session"
                    : "Judging"}
            </h1>
          </div>
          <div className="queue-progress">
            <div className="progress-copy">
              <span>
                {finalMode
                  ? "Your finalist progress"
                  : "Collective queue progress"}
              </span>
              <strong>
                {reviewed} / {total}
              </strong>
            </div>
            <div className="progress-track">
              <span
                style={{ width: `${total ? (reviewed / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </section>

        {error && <div className="error-banner page-error">{error}</div>}

        <div
          aria-busy={transitioning}
          className={`project-transition-shell${transitioning ? " switching" : ""}`}
        >
          {!submission ? (
            <section className="empty-state card">
              <span className="success-icon">✓</span>
              <h2>The queue is clear</h2>
              <p>
                There are no available submissions right now. You completed{" "}
                {completedNow} {completedNow === 1 ? "review" : "reviews"} in
                this session.
              </p>
              <a
                className="empty-state-results-link"
                href={`${pageBase}/results`}
              >
                See results <span aria-hidden>→</span>
              </a>
            </section>
          ) : (
            <div className="judging-layout">
              <div className="submission-scroll-frame" key={submission.id}>
                <SubmissionDetails submission={submission} />
              </div>

              {inspectionMode && editingReviewIndex === null ? (
                <aside className="compact-score-card admin-inspection-card card">
                  <header className="compact-score-header">
                    <div>
                      <span className="eyebrow">Administrator controls</span>
                      <h2>Active session</h2>
                    </div>
                    <span className="table-status in-progress">
                      In progress
                    </span>
                  </header>

                  <div className="admin-session-details">
                    <div>
                      <span>Assigned judge</span>
                      <strong>{submission.claimedBy || "Unknown judge"}</strong>
                    </div>
                    <div>
                      <span>Project</span>
                      <strong>{submission.projectName}</strong>
                    </div>
                    <div>
                      <span>Claimed</span>
                      <strong>{formatSubmitted(submission.claimedAt)}</strong>
                    </div>
                    <div>
                      <span>Completed reviews</span>
                      <strong>
                        {submission.reviews.length} of{" "}
                        {JUDGING_POLICY.preliminary.requiredReviews}
                      </strong>
                    </div>
                  </div>

                  <div className="release-explanation">
                    <strong>Return this project to the queue</strong>
                    <p>
                      Releasing removes the current reservation. Another judge
                      can immediately claim this submission.
                    </p>
                  </div>

                  <button
                    className="danger-button"
                    disabled={releasing}
                    onClick={releaseSession}
                    type="button"
                  >
                    {releasing ? "Releasing…" : "Release submission"}
                    {!releasing && <span>↗</span>}
                  </button>

                  <a
                    className="back-to-dashboard"
                    href={`${pageBase}/dashboard`}
                  >
                    ← Back to dashboard
                  </a>
                </aside>
              ) : (
                <aside className="compact-score-card card">
                  <header className="compact-score-header">
                    <div>
                      <span className="eyebrow">
                        {finalMode
                          ? editingFinalReview
                            ? `Editing your final review`
                            : "Final-round review"
                          : editingReviewIndex !== null
                            ? `Review by ${
                                submission.reviews[editingReviewIndex]
                                  ?.judgeName || "unknown judge"
                              }`
                            : `Review ${Math.min(
                                submission.reviews.length + 1,
                                JUDGING_POLICY.preliminary.requiredReviews,
                              )} of {JUDGING_POLICY.preliminary.requiredReviews}`}
                      </span>
                      <h2>
                        {finalMode
                          ? editingFinalReview
                            ? "Edit presentation score"
                            : "Score this presentation"
                          : editingReviewIndex !== null
                            ? "Edit submitted score"
                            : "Score this project"}
                      </h2>
                    </div>
                    <div className="compact-total">
                      <strong>{totalScore || "—"}</strong>
                      <span>/{RUBRIC_SCORE_MAX}</span>
                    </div>
                  </header>

                  <ScoreControl
                    highAnchor="Exceptional progress tonight"
                    label={RUBRIC.progress.label}
                    lowAnchor="Little meaningful progress"
                    onChange={setProgress}
                    value={progress}
                  />
                  <ScoreControl
                    highAnchor="Solves an actual problem"
                    label={RUBRIC.practicality.label}
                    lowAnchor="No real-world use case"
                    onChange={setPracticality}
                    value={practicality}
                  />
                  <ScoreControl
                    highAnchor="Complex and well executed"
                    label={RUBRIC.complexity.label}
                    lowAnchor="Technically straightforward"
                    onChange={setComplexity}
                    value={complexity}
                  />

                  <label className="field compact-notes">
                    <span>
                      Private notes <small>Optional</small>
                    </span>
                    <textarea
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Add context for this score…"
                      rows={3}
                      value={notes}
                    />
                  </label>

                  <footer className="compact-submit">
                    <p>
                      {finalMode ? (
                        <>
                          Score the team’s live presentation. You can return and
                          edit this review from the Top{" "}
                          {JUDGING_POLICY.finals.finalistCount} tab.
                        </>
                      ) : editingReviewIndex !== null ? (
                        <>
                          Updating this judge’s review will recalculate the
                          project’s total score.
                        </>
                      ) : (
                        <>
                          This project is reserved for <strong>{name}</strong>.
                        </>
                      )}
                    </p>
                    <button
                      className="primary-button"
                      disabled={submitting}
                      onClick={
                        finalMode
                          ? submitFinalScore
                          : editingReviewIndex !== null
                            ? updateSelectedReview
                            : submitScore
                      }
                      type="button"
                    >
                      {submitting
                        ? "Saving…"
                        : finalMode
                          ? editingFinalReview
                            ? "Update final score"
                            : "Submit final score"
                          : editingReviewIndex !== null
                            ? "Update score"
                            : "Submit score"}
                      {!submitting && <span>→</span>}
                    </button>
                  </footer>
                  {finalMode && (
                    <a
                      className="back-to-dashboard"
                      href={`${pageBase}/leaderboard`}
                    >
                      ← Back to Top {JUDGING_POLICY.finals.finalistCount}
                    </a>
                  )}
                  {!finalMode && editingReviewIndex !== null && (
                    <a
                      className="back-to-dashboard"
                      href={`${pageBase}/results`}
                    >
                      ← Back to results
                    </a>
                  )}
                </aside>
              )}
            </div>
          )}
        </div>
      </main>

      <div
        aria-live="polite"
        className={`submission-confirmation ${transitionState}`}
        role="status"
      >
        <div className="submission-confirmation-content">
          <span className="submission-saving-spinner" aria-hidden />
          <svg aria-hidden className="submission-check" viewBox="0 0 80 80">
            <circle
              className="submission-check-circle"
              cx="40"
              cy="40"
              r="35"
            />
            <path
              className="submission-check-mark"
              d="M24 41.5 35.5 53 57 29.5"
            />
          </svg>
          <div>
            <strong>
              {transitionState === "success" || transitionState === "exiting"
                ? finalMode
                  ? "Final score submitted"
                  : "Score submitted"
                : "Submitting score"}
            </strong>
            <span>
              {transitionState === "success" || transitionState === "exiting"
                ? finalMode
                  ? "Returning to the finalists…"
                  : "Loading the next project…"
                : "Saving your review…"}
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
