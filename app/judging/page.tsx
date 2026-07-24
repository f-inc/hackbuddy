"use client";

import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ScoreControl } from "@/components/ScoreControl";
import type { QueueStats, Submission } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

type ClaimResponse = {
  submission: Submission | null;
  stats: QueueStats;
  demoMode: boolean;
  error?: string;
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

function repositoryDetails(value: string) {
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname)
      .replace(/^\/|\/$/g, "")
      .replace(/\.git$/i, "");
    return {
      host: url.hostname.replace(/^www\./, ""),
      label: path || url.hostname,
    };
  } catch {
    return { host: "Source code", label: value };
  }
}

export default function JudgingPage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"judge" | "admin">("judge");
  const [inspectionMode, setInspectionMode] = useState(false);
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
  const [showTeamPhoto, setShowTeamPhoto] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionState, setTransitionState] = useState<
    "idle" | "saving" | "success"
  >("idle");
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    document.body.classList.add("judging-scroll-lock");
    return () => document.body.classList.remove("judging-scroll-lock");
  }, []);

  const claim = useCallback(async (showFullPageLoader = false) => {
    if (showFullPageLoader) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/queue/claim", { method: "POST" });
      if (response.status === 401) {
        window.location.href = "/";
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
        caught instanceof Error ? caught.message : "Could not load the queue.",
      );
    } finally {
      if (showFullPageLoader) setLoading(false);
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

      const submissionId = new URLSearchParams(window.location.search).get(
        "submission",
      );
      if (session.role === "admin" && submissionId) {
        setInspectionMode(true);
        setLoading(true);
        const inspectionResponse = await fetch(
          `/api/admin/submission?id=${encodeURIComponent(submissionId)}`,
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
        setLoading(false);
        return;
      }

      await claim(true);
    }
    void initialize();
  }, [claim]);

  useEffect(() => {
    if (!showTeamPhoto) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowTeamPhoto(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [showTeamPhoto]);

  useEffect(() => {
    if (!name) return;

    async function refreshCollectiveProgress() {
      const response = await fetch("/api/dashboard");
      if (!response.ok) return;
      const result = (await response.json()) as { stats: QueueStats };
      setStats(result.stats);
    }

    const interval = window.setInterval(
      () => void refreshCollectiveProgress(),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, [name]);

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
      const response = await fetch("/api/queue/complete", {
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
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setTransitionState("idle");
          setTransitioning(false);
        });
      });
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
      const response = await fetch("/api/admin/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submission.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      window.location.href = "/dashboard";
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not release this submission.",
      );
      setReleasing(false);
    }
  }

  if (!name || loading) return <LoadingScreen />;

  const reviewed = stats?.completed ?? 0;
  const total = stats?.total ?? 0;
  const totalScore = progress + practicality + complexity;
  const repository = submission?.repositoryUrl
    ? repositoryDetails(submission.repositoryUrl)
    : null;
  const isVideo =
    submission?.demoType.startsWith("video/") ||
    Boolean(submission?.demoUrl.match(/\.(mp4|webm|mov)(?:\?|$)/i));

  return (
    <AppShell name={name} role={role}>
      {demoMode && (
        <div className="demo-banner">
          Preview mode — add Airtable credentials to use live submissions.
        </div>
      )}

      <main className="workspace-main judging-main">
        <section className="workspace-toolbar compact-toolbar">
          <div>
            <span className="eyebrow">
              {inspectionMode
                ? "Administrator session view"
                : "Newest submission first"}
            </span>
            <h1>{inspectionMode ? "Inspect judging session" : "Judging"}</h1>
          </div>
          <div className="queue-progress">
            <div className="progress-copy">
              <span>Collective queue progress</span>
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
            </section>
          ) : (
            <div className="judging-layout">
              <div className="submission-scroll-frame">
              <article
                aria-label="Submission details"
                className="project-workspace card"
                tabIndex={0}
              >
              <header className="project-header">
                <div>
                  <div className="project-badges">
                    <span className="status-badge">
                      <span />
                      In progress
                    </span>
                    <span className="track-badge">{submission.track}</span>
                  </div>
                  <h2>{submission.projectName}</h2>
                  <p className="project-byline">by {submission.teamName}</p>
                </div>
                <div className="project-record">
                  <span>Latest submission</span>
                  <strong>#{submission.id.slice(-6)}</strong>
                </div>
              </header>

              <section className="media-stage">
                {isVideo && submission.demoUrl ? (
                  <video
                    autoPlay
                    controls
                    loop
                    muted
                    playsInline
                    poster={submission.previewImageUrl || undefined}
                    preload="metadata"
                    src={submission.demoUrl}
                  >
                    Your browser does not support embedded video.
                  </video>
                ) : submission.previewImageUrl ? (
                  <div
                    className="media-image"
                    style={{
                      backgroundImage: `url("${submission.previewImageUrl}")`,
                    }}
                  />
                ) : (
                  <div className="media-placeholder">
                    <span>No media preview submitted</span>
                  </div>
                )}

                <div className="media-actions">
                  {submission.previewImageUrl && (
                    <a
                      href={submission.previewImageUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Progress image ↗
                    </a>
                  )}
                </div>
              </section>

              <section className="submission-story">
                <div className="story-block one-liner-block">
                  <span>One-liner</span>
                  <p>
                    {submission.oneLiner ||
                      "No one-line description was provided."}
                  </p>
                </div>
                {submission.description &&
                  submission.description.trim() !==
                    submission.oneLiner.trim() && (
                    <div className="story-block">
                      <span>Project description</span>
                      <p>{submission.description}</p>
                    </div>
                  )}
              </section>

              {submission.repositoryUrl && repository && (
                <a
                  className="repository-preview"
                  href={submission.repositoryUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span
                    aria-label="GitHub"
                    className="repository-icon github-icon"
                    role="img"
                  />
                  <span className="repository-copy">
                    <small>Source repository</small>
                    <strong>
                      {repository.label}
                    </strong>
                    <span>
                      {repository.host}
                    </span>
                  </span>
                  <span className="repository-arrow" aria-hidden>
                    ↗
                  </span>
                </a>
              )}

              <section className="submission-details">
                <div className="detail-item builders">
                  {submission.teamPhotoUrl ? (
                    <button
                      aria-label={`Enlarge photo of ${submission.submitterNames || submission.teamName}`}
                      className="team-photo"
                      onClick={() => setShowTeamPhoto(true)}
                      style={{
                        backgroundImage: `url("${submission.teamPhotoUrl}")`,
                      }}
                      type="button"
                    />
                  ) : (
                    <span className="detail-icon">◎</span>
                  )}
                  <div>
                    <span>Builders</span>
                    <strong>
                      {submission.submitterNames || submission.teamName}
                    </strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">⌂</span>
                  <div>
                    <span>Demo attendance</span>
                    <strong>{submission.attendance || "Not provided"}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">◷</span>
                  <div>
                    <span>Submitted</span>
                    <strong>{formatSubmitted(submission.createdAt)}</strong>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-icon">@</span>
                  <div>
                    <span>Contact</span>
                    {submission.contactEmail ? (
                      <a href={`mailto:${submission.contactEmail}`}>
                        {submission.contactEmail}
                      </a>
                    ) : (
                      <strong>Not provided</strong>
                    )}
                  </div>
                </div>
              </section>
              </article>
              </div>

              {inspectionMode ? (
              <aside className="compact-score-card admin-inspection-card card">
                <header className="compact-score-header">
                  <div>
                    <span className="eyebrow">Administrator controls</span>
                    <h2>Active session</h2>
                  </div>
                  <span className="table-status in-progress">In progress</span>
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
                </div>

                <div className="release-explanation">
                  <strong>Return this project to the queue</strong>
                  <p>
                    Releasing removes the current reservation. Another judge can
                    immediately claim this submission.
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

                <a className="back-to-dashboard" href="/dashboard">
                  ← Back to dashboard
                </a>
              </aside>
            ) : (
              <aside className="compact-score-card card">
                <header className="compact-score-header">
                  <div>
                    <span className="eyebrow">Scoring rubric</span>
                    <h2>Score this project</h2>
                  </div>
                  <div className="compact-total">
                    <strong>{totalScore || "—"}</strong>
                    <span>/30</span>
                  </div>
                </header>

                <ScoreControl
                  description="Meaningful progress completed tonight"
                  label="One-night progress"
                  onChange={setProgress}
                  value={progress}
                />
                <ScoreControl
                  description="Useful, feasible, and relevant"
                  label="Practicality"
                  onChange={setPracticality}
                  value={practicality}
                />
                <ScoreControl
                  description="Technical difficulty and execution"
                  label="Technical complexity"
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
                    This project is reserved for <strong>{name}</strong>.
                  </p>
                  <button
                    className="primary-button"
                    disabled={submitting}
                    onClick={submitScore}
                    type="button"
                  >
                    {submitting ? "Saving…" : "Submit score"}
                    {!submitting && <span>→</span>}
                  </button>
                </footer>
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
          <svg
            aria-hidden
            className="submission-check"
            viewBox="0 0 80 80"
          >
            <circle className="submission-check-circle" cx="40" cy="40" r="35" />
            <path
              className="submission-check-mark"
              d="M24 41.5 35.5 53 57 29.5"
            />
          </svg>
          <div>
            <strong>
              {transitionState === "success"
                ? "Score submitted"
                : "Submitting score"}
            </strong>
            <span>
              {transitionState === "success"
                ? "Loading the next project…"
                : "Saving your review…"}
            </span>
          </div>
        </div>
      </div>

      {showTeamPhoto && submission?.teamPhotoUrl && (
        <div
          aria-label="Builder photo preview"
          aria-modal="true"
          className="photo-modal"
          onClick={() => setShowTeamPhoto(false)}
          role="dialog"
        >
          <div
            className="photo-modal-content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Close photo"
              className="photo-modal-close"
              onClick={() => setShowTeamPhoto(false)}
              type="button"
            >
              ×
            </button>
            <div
              aria-label={`Builders: ${submission.submitterNames || submission.teamName}`}
              className="photo-modal-image"
              role="img"
              style={{
                backgroundImage: `url("${submission.teamPhotoUrl}")`,
              }}
            />
            <div className="photo-modal-caption">
              <span>Builders</span>
              <strong>
                {submission.submitterNames || submission.teamName}
              </strong>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
