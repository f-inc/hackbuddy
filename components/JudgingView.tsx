"use client";
import { useManagedEvent, useJudgingPolicy, useEventSettings } from "./EventConfig";
import { MAKERMODS_FORM } from "@/domain/submission-form";
import "./creative-rubric.css";

import { CREATIVE_RUBRIC, EMPTY_CREATIVE, creativeError, creativeTotal, type CreativeScores } from "@/domain/creative-rubric";
import { CreativeScoreFields } from "./CreativeScoreFields";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ScoreControl } from "@/components/ScoreControl";
import { SubmissionDetails } from "@/components/SubmissionDetails";
import { RUBRIC } from "@/domain/judging-policy";
import type { FinalsState, QueueStats, Submission, SubmissionReview } from "@/lib/types";
import { useCallback, useEffect, useState, useRef } from "react";

type ClaimResponse = {
  submission: Submission | null;
  stats: QueueStats;
  demoMode: boolean;
  draft?: { scores: Partial<import("@/domain/submission").ReviewScores>; updatedAt: string } | null;
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
  const managed = useManagedEvent();
  const makerMods = useEventSettings().submissionForm === MAKERMODS_FORM;
  const JUDGING_POLICY = useJudgingPolicy();
  const RUBRIC_SCORE_MAX = JUDGING_POLICY.reviewMax;

  const apiBase = hackathon ? `/api/hackathons/${hackathon}` : "/api";
  const pageBase = hackathon ? `/${hackathon}` : "";
  const [name, setName] = useState("");
  const [role, setRole] = useState<"judge" | "admin">("judge");
  const [inspectionMode, setInspectionMode] = useState(false);
  const [finalMode, setFinalMode] = useState(false);
  const [editingFinalReview, setEditingFinalReview] = useState(false);
  const [finalsState, setFinalsState] = useState<FinalsState | null>(null);
  const [editingReviewIndex, setEditingReviewIndex] = useState<number | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [progress, setProgress] = useState(0);
  const [practicality, setPracticality] = useState(0);
  const [complexity, setComplexity] = useState(0);
  const [creative, setCreative] = useState<CreativeScores>({ ...EMPTY_CREATIVE });
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [completedNow, setCompletedNow] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionState, setTransitionState] = useState<"idle" | "saving" | "success" | "exiting">(
    "idle",
  );
  const [releasing, setReleasing] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);

  useEffect(() => {
    document.body.classList.add("judging-scroll-lock");
    return () => document.body.classList.remove("judging-scroll-lock");
  }, []);

  const [draftStatus, setDraftStatus] = useState("");
  const [draftReady, setDraftReady] = useState("");
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const draftKey = (id: string) => `hackbuddy-review:${hackathon || "default"}:${name}:${id}`;
  const restoreClaim = useCallback(
    (result: ClaimResponse) => {
      let draft = result.draft;
      if (result.submission) {
        try {
          const saved = JSON.parse(
            localStorage.getItem(
              `hackbuddy-review:${hackathon || "default"}:${name}:${result.submission.id}`,
            ) || "null",
          );
          if (saved && (!draft || saved.updatedAt > draft.updatedAt)) draft = saved;
        } catch {}
      }
      setCreative(draft?.scores.creative || { ...EMPTY_CREATIVE });
      setProgress(draft?.scores.progress || 0);
      setPracticality(draft?.scores.practicality || 0);
      setComplexity(draft?.scores.complexity || 0);
      setNotes(draft?.scores.notes || "");
      setDraftReady(result.submission?.id || "");
      setDraftStatus(draft ? "Saved draft restored" : "");
    },
    [hackathon, name],
  );
  useEffect(() => {
    if (
      !submission ||
      inspectionMode ||
      finalMode ||
      draftReady !== submission.id ||
      submitting ||
      skipping
    )
      return;
    const scores = {
      ...(makerMods ? { creative } : {}),
      ...(progress ? { progress } : {}),
      ...(practicality ? { practicality } : {}),
      ...(complexity ? { complexity } : {}),
      notes,
    };
    const key = `hackbuddy-review:${hackathon || "default"}:${name}:${submission.id}`;
    const draft = { scores, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {}
    const save = () => {
      if (!managed) {
        setDraftStatus("Draft saved on this device");
        return;
      }
      saveChain.current = saveChain.current
        .catch(() => {})
        .then(async () => {
          const r = await fetch(`${apiBase}/queue/draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: submission.id, scores }),
          });
          if (!r.ok) {
            const d = await r.json();
            throw new Error(d.error);
          }
          setDraftStatus("Draft saved");
        })
        .catch(() => setDraftStatus("Saved on this device. Reconnect to sync."));
    };
    const timer = window.setTimeout(save, 800);
    const heartbeat = window.setInterval(save, 60000);
    window.addEventListener("online", save);
    return () => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      window.removeEventListener("online", save);
    };
  }, [
    submission,
    inspectionMode,
    finalMode,
    draftReady,
    submitting,
    skipping,
    progress,
    practicality,
    complexity,
    notes,
    creative,
    makerMods,
    hackathon,
    name,
    managed,
    apiBase,
  ]);

  const claim = useCallback(
    async (showFullPageLoader = false, skippedIds: string[] = []) => {
      if (showFullPageLoader) setLoading(true);
      setError("");
      try {
        const response = await fetch(`${apiBase}/queue/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skippedIds }),
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
        restoreClaim(result);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load the queue.");
      } finally {
        if (showFullPageLoader) setLoading(false);
      }
    },
    [apiBase, hackathon, restoreClaim],
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
        window.location.href = session.hackathon ? `/${session.hackathon}/judging` : "/";
        return;
      }
      if (hackathon && session.role !== "admin" && session.hackathon !== hackathon) {
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
        reviewParam !== null && /^\d+$/.test(reviewParam) ? Number(reviewParam) : null;
      if (isFinalMode) {
        window.location.replace(`${pageBase}/second-pass`);
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
          setCreative(result.existingReview.creative || { ...EMPTY_CREATIVE });
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
        if (selectedReviewIndex !== null && result.submission?.reviews[selectedReviewIndex]) {
          const selectedReview = result.submission.reviews[selectedReviewIndex];
          setCreative(selectedReview.creative || { ...EMPTY_CREATIVE });
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

    const interval = window.setInterval(() => void refreshCollectiveProgress(), 30_000);
    return () => window.clearInterval(interval);
  }, [apiBase, finalMode, name]);

  async function skipCurrentSubmission() {
    if (!submission || submitting || skipping) return;
    setSkipping(true);
    setError("");
    try {
      await saveChain.current;
      if (managed) {
        const saved = await fetch(`${apiBase}/queue/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: submission.id,
            scores: {
              ...(progress ? { progress } : {}),
              ...(practicality ? { practicality } : {}),
              ...(complexity ? { complexity } : {}),
              ...(makerMods ? { creative } : {}),
          notes,
            },
          }),
        });
        if (!saved.ok) throw new Error("Draft could not be synced. Your local draft is retained.");
      }
      const response = await fetch(`${apiBase}/queue/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submission.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      const nextSkippedIds = [...new Set([...skippedIds, submission.id])];
      setSkippedIds(nextSkippedIds);
      // The reservation is released even if loading the next project fails.
      setSubmission(null);
      setDraftReady("");
      await claim(false, nextSkippedIds);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not skip this submission.");
    } finally {
      setSkipping(false);
    }
  }

  async function submitScore() {
    if (submitting || skipping) return;
    if (!submission || (makerMods ? !!creativeError(creative) : (!progress || !practicality || !complexity))) {
      setError(makerMods ? creativeError(creative) || "Score all five axes." : "Choose a score for all three rubric categories.");
      return;
    }

    setSubmitting(true);
    setTransitioning(true);
    setTransitionState("saving");
    setError("");
    try {
      await saveChain.current;
      const response = await fetch(`${apiBase}/queue/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: submission.id,
          progress,
          practicality,
          complexity,
          ...(makerMods ? { creative } : {}),
          notes,
          skippedIds,
        }),
      });
      const result = (await response.json()) as ClaimResponse & {
        ok?: boolean;
      };
      if (!response.ok) throw new Error(result.error);
      try {
        localStorage.removeItem(draftKey(submission.id));
      } catch {}
      setTransitionState("success");
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      setCompletedNow((count) => count + 1);
      setSubmission(result.submission);
      setStats(result.stats);
      setDemoMode(result.demoMode);
      restoreClaim(result);
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
      setError(caught instanceof Error ? caught.message : "Could not save the score.");
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
      setError(caught instanceof Error ? caught.message : "Could not release this submission.");
      setReleasing(false);
    }
  }

  async function updateSelectedReview() {
    if (!submission || (makerMods ? !!creativeError(creative) : (!progress || !practicality || !complexity))) {
      setError(makerMods ? creativeError(creative) || "Score all five axes." : "Choose a score for all three rubric categories.");
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
          ...(makerMods ? { creative } : {}),
          notes,
        }),
      });
      const result = (await response.json()) as ClaimResponse & {
        ok?: boolean;
      };
      if (!response.ok) throw new Error(result.error);
      window.location.href = `${pageBase}/results`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the review.");
      setSubmitting(false);
    }
  }

  async function submitFinalScore() {
    if (!submission || (makerMods ? !!creativeError(creative) : (!progress || !practicality || !complexity))) {
      setError(makerMods ? creativeError(creative) || "Score all five axes." : "Choose a score for all three rubric categories.");
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
          ...(makerMods ? { creative } : {}),
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
      window.location.href = `${pageBase}/second-pass`;
    } catch (caught) {
      setTransitionState("idle");
      setTransitioning(false);
      setError(caught instanceof Error ? caught.message : "Could not save the final score.");
      setSubmitting(false);
    }
  }

  if (!name || loading) return <LoadingScreen />;

  const reviewed = finalMode
    ? (finalsState?.finalists.filter((finalist) => finalist.reviewedByYou).length ?? 0)
    : (stats?.completed ?? 0);
  const total = finalMode
    ? (finalsState?.finalists.length ?? JUDGING_POLICY.finals.finalistCount)
    : (stats?.total ?? 0);
  const totalScore = makerMods ? creativeTotal(creative) : progress + practicality + complexity;
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
                    : "First pass judging"}
            </h1>
          </div>
          <div className="queue-progress">
            <div className="progress-copy">
              <span>{finalMode ? "Your finalist progress" : "Collective queue progress"}</span>
              <strong>
                {reviewed} / {total}
              </strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${total ? (reviewed / total) * 100 : 0}%` }} />
            </div>
          </div>
        </section>

        {makerMods && !finalMode && (
          <section className="creative-rubric card" aria-labelledby="creative-rubric-title">
            <header className="creative-rubric-header">
              <h2 id="creative-rubric-title">Creative Applications rubric</h2>
              <span>1–5 per axis · weighted total out of 100</span>
            </header>
            <p>3-minute robot demo, then 2 minutes of questions. Video demos are capped at 3 for Demo quality. Teams stay at their stations; top 5 present before awards.</p>
            <div className="creative-rubric-grid">
              {CREATIVE_RUBRIC.map((criterion) => (
                <div key={criterion.key}>
                  <h3>{criterion.label} · {criterion.weight}%</h3>
                  <p>1: {criterion.low} · 3: {criterion.middle} · 5: {criterion.high}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {error && <div className="error-banner page-error">{error}</div>}

        <div
          aria-busy={transitioning || skipping}
          className={`project-transition-shell${transitioning ? " switching" : ""}`}
        >
          {!submission ? (
            <section className="empty-state card">
              <span className="success-icon">✓</span>
              <h2>
                {skipping
                  ? "Loading the next project…"
                  : error
                    ? "Could not load the next project"
                    : skippedIds.length
                      ? "No more projects in your queue"
                      : "The queue is clear"}
              </h2>
              <p>
                {skippedIds.length
                  ? "Any projects you skipped remain available for other judges. "
                  : "There are no available submissions right now. "}
                You completed {completedNow} {completedNow === 1 ? "review" : "reviews"} in this
                session.
              </p>
              {!inspectionMode && !finalMode && (
                <button
                  className="secondary-button"
                  disabled={skipping || loading}
                  onClick={() => {
                    setSkippedIds([]);
                    void claim(true);
                  }}
                  type="button"
                >
                  {skippedIds.length ? "Revisit skipped submissions" : "Check queue"}
                </button>
              )}
              <a className="empty-state-results-link" href={`${pageBase}/results`}>
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
                    <div>
                      <span>Completed reviews</span>
                      <strong>
                        {submission.reviews.length} of {JUDGING_POLICY.preliminary.requiredReviews}
                      </strong>
                    </div>
                  </div>

                  <div className="release-explanation">
                    <strong>Return this project to the queue</strong>
                    <p>
                      Releasing removes the current reservation. Another judge can immediately claim
                      this submission.
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

                  <a className="back-to-dashboard" href={`${pageBase}/dashboard`}>
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
                                submission.reviews[editingReviewIndex]?.judgeName || "unknown judge"
                              }`
                            : `Review ${Math.min(
                                submission.reviews.length + 1,
                                JUDGING_POLICY.preliminary.requiredReviews,
                              )} of ${JUDGING_POLICY.preliminary.requiredReviews}`}
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

                  {makerMods ? <CreativeScoreFields value={creative} onChange={setCreative} /> : <>
                  <ScoreControl
                    max={JUDGING_POLICY.score.max}
                    highAnchor="Exceptional progress tonight"
                    label={RUBRIC.progress.label}
                    lowAnchor="Little meaningful progress"
                    onChange={setProgress}
                    value={progress}
                  />
                  <ScoreControl
                    max={JUDGING_POLICY.score.max}
                    highAnchor="Solves an actual problem"
                    label={RUBRIC.practicality.label}
                    lowAnchor="No real-world use case"
                    onChange={setPracticality}
                    value={practicality}
                  />
                  <ScoreControl
                    max={JUDGING_POLICY.score.max}
                    highAnchor="Complex and well executed"
                    label={RUBRIC.complexity.label}
                    lowAnchor="Technically straightforward"
                    onChange={setComplexity}
                    value={complexity}
                  />

                  </>}

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
                    {!inspectionMode && !finalMode && (
                      <span role="status" className="field-hint">
                        {draftStatus}
                      </span>
                    )}
                    <p>
                      {finalMode ? (
                        <>
                          Score the team’s live presentation. You can return and edit this review
                          from the Second pass tab.
                        </>
                      ) : editingReviewIndex !== null ? (
                        <>
                          Updating this judge’s review will recalculate the project’s total score.
                        </>
                      ) : (
                        <>
                          This project is reserved for <strong>{name}</strong>. Scores and notes are
                          saved automatically.
                        </>
                      )}
                    </p>
                    <button
                      className="primary-button"
                      disabled={submitting || skipping}
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
                    {!inspectionMode && !finalMode && (
                      <button
                        className="secondary-button skip-submission-button"
                        disabled={submitting || skipping}
                        onClick={skipCurrentSubmission}
                        type="button"
                      >
                        {skipping ? "Skipping…" : "Skip submission"}
                        {!skipping && <span aria-hidden>→</span>}
                      </button>
                    )}
                  </footer>
                  {finalMode && (
                    <a className="back-to-dashboard" href={`${pageBase}/second-pass`}>
                      ← Back to Second pass
                    </a>
                  )}
                  {!finalMode && editingReviewIndex !== null && (
                    <a className="back-to-dashboard" href={`${pageBase}/results`}>
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
            <circle className="submission-check-circle" cx="40" cy="40" r="35" />
            <path className="submission-check-mark" d="M24 41.5 35.5 53 57 29.5" />
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
