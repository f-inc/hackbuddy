"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { LoadingScreen } from "./LoadingScreen";
import { ScoreControl } from "./ScoreControl";
import { SubmissionDetails } from "./SubmissionDetails";
import { RUBRIC, RUBRIC_SCORE_MAX } from "@/domain/judging-policy";
import type { JudgedProject } from "@/domain/judge-history";
import type { ReviewPhase, Submission } from "@/domain/submission";

type Session = { name: string; role: "judge" | "admin"; hackathon?: string };
type HistoryResponse = {
  projects?: JudgedProject[];
  project?: JudgedProject;
  submission?: Submission;
  demoMode?: boolean;
  error?: string;
};
type RoundFilter = "all" | ReviewPhase;

function reviewedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function ResultSummary({ project }: { project: JudgedProject }) {
  return (
    <div className="history-result">
      <div>
        <span>Preliminary result</span>
        <strong>
          {project.result.complete ? (
            <>
              {project.result.score}
              <small> / {project.result.maximum}</small>
            </>
          ) : (
            "Awaiting another review"
          )}
        </strong>
      </div>
      {project.result.rank !== null && (
        <span className="history-rank">
          #{project.result.rank}
          <small> overall</small>
        </span>
      )}
      {project.finalResult && (
        <div className="history-final-result">
          <span>
            Final round{!project.finalResult.complete && " · in progress"}
          </span>
          <strong>
            {project.finalResult.score}
            <small> / {project.finalResult.maximum}</small>
          </strong>
        </div>
      )}
    </div>
  );
}

export function JudgedProjectsView({
  hackathon,
  hackathonName,
  hackathonImageUrl,
  submissionId,
  initialPhase = "preliminary",
}: {
  hackathon: string;
  hackathonName: string;
  hackathonImageUrl?: string;
  submissionId?: string;
  initialPhase?: ReviewPhase;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [round, setRound] = useState<RoundFilter>("all");
  const [phase, setPhase] = useState<ReviewPhase>(initialPhase);
  const [retry, setRetry] = useState(0);
  const base = `/${hackathon}`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const auth = await fetch("/api/auth/session", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (auth.status === 401) {
          window.location.assign(base);
          return;
        }
        if (!auth.ok) throw new Error("Your session could not be loaded.");
        const current = (await auth.json()) as Session;
        setSession(current);
        if (current.role === "judge" && current.hackathon !== hackathon) {
          throw new Error(
            "Sign in to this hackathon to view your judged projects.",
          );
        }
        const response = await fetch(
          `/api/hackathons/${hackathon}/judged${submissionId ? `?id=${encodeURIComponent(submissionId)}` : ""}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const result = (await response.json()) as HistoryResponse;
        if (!response.ok)
          throw new Error(
            result.error || "Your judged projects could not be loaded.",
          );
        setData(result);
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Your judged projects could not be loaded.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [base, hackathon, submissionId, retry]);

  const projects = useMemo(() => data?.projects ?? [], [data]);
  const allReviews = projects.flatMap((p) => p.myReviews);
  const filtered = projects.filter(
    (p) =>
      (round === "all" || p.myReviews.some((r) => r.phase === round)) &&
      `${p.projectName} ${p.teamName} ${p.track} ${p.oneLiner}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const average = allReviews.length
    ? (
        allReviews.reduce((sum, r) => sum + r.review.totalScore, 0) /
        allReviews.length
      ).toFixed(1)
    : "—";
  const project = data?.project;
  const selected =
    project?.myReviews.find((r) => r.phase === phase) ?? project?.myReviews[0];

  if (loading) return <LoadingScreen />;

  return (
    <AppShell
      name={session?.name ?? ""}
      role={session?.role ?? "judge"}
      hackathon={hackathon}
      hackathonName={hackathonName}
      hackathonImageUrl={hackathonImageUrl}
    >
      {data?.demoMode && (
        <div className="demo-banner">
          Preview mode — showing sample review history.
        </div>
      )}
      <main className="workspace-main history-main">
        {submissionId && (
          <Link className="history-back" href={`${base}/judged`}>
            ← Projects judged
          </Link>
        )}
        <header className="history-heading">
          <div>
            <span className="eyebrow">
              {submissionId ? "Your saved review" : "Your judging history"}
            </span>
            <h1>
              {submissionId
                ? project?.projectName || "Project review"
                : "Projects judged"}
            </h1>
            <p>
              {submissionId
                ? "Revisit the project, your scores, and the notes you left."
                : "Every project you reviewed. Your perspective, alongside the results."}
            </p>
          </div>
          {!submissionId && (
            <span className="history-event-label">{hackathonName}</span>
          )}
        </header>

        {error ? (
          <section className="history-empty card" role="alert">
            <h2>We couldn’t load your reviews</h2>
            <p>{error}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </button>
          </section>
        ) : submissionId && project && data?.submission && selected ? (
          <>
            <div className="history-review-toolbar">
              <div className="history-filters" aria-label="Review round">
                {project.myReviews.map((r) => (
                  <button
                    type="button"
                    key={r.phase}
                    aria-pressed={selected.phase === r.phase}
                    onClick={() => setPhase(r.phase)}
                  >
                    {r.phase === "preliminary"
                      ? "Preliminary review"
                      : "Final review"}
                  </button>
                ))}
              </div>
              <span className="history-saved-date">
                Reviewed {reviewedDate(selected.review.completedAt)} · Read only
              </span>
            </div>
            <div className="judging-layout history-review-layout">
              <div className="submission-scroll-frame">
                <SubmissionDetails submission={data.submission} />
              </div>
              <aside className="compact-score-card history-score-card card">
                <header className="compact-score-header">
                  <div>
                    <span className="eyebrow">
                      {selected.phase === "final"
                        ? "Final-round review"
                        : "Preliminary review"}
                    </span>
                    <h2>Your submitted score</h2>
                  </div>
                  <div className="compact-total">
                    <strong>{selected.review.totalScore}</strong>
                    <span>/{RUBRIC_SCORE_MAX}</span>
                  </div>
                </header>
                <ScoreControl
                  label={RUBRIC.progress.label}
                  lowAnchor="Little meaningful progress"
                  highAnchor="Exceptional progress tonight"
                  value={selected.review.progressScore}
                  readOnly
                />
                <ScoreControl
                  label={RUBRIC.practicality.label}
                  lowAnchor="No real-world use case"
                  highAnchor="Solves an actual problem"
                  value={selected.review.practicalityScore}
                  readOnly
                />
                <ScoreControl
                  label={RUBRIC.complexity.label}
                  lowAnchor="Technically straightforward"
                  highAnchor="Complex and well executed"
                  value={selected.review.complexityScore}
                  readOnly
                />
                <label className="field compact-notes">
                  <span>Your private notes</span>
                  <textarea
                    readOnly
                    rows={4}
                    value={
                      selected.review.notes || "No notes saved for this review."
                    }
                  />
                </label>
                <ResultSummary project={project} />
                <p className="history-readonly-note">
                  Your review is saved. Browsing here won’t change scores or
                  reserve a project. Project details reflect the current
                  submission.
                </p>
              </aside>
            </div>
          </>
        ) : (
          !submissionId && (
            <>
              <section
                className="history-stats"
                aria-label="Your judging summary"
              >
                <div>
                  <span>Projects judged</span>
                  <strong>{projects.length}</strong>
                  <small>Across this hackathon</small>
                </div>
                <div>
                  <span>Reviews submitted</span>
                  <strong>{allReviews.length}</strong>
                  <small>Preliminary & final rounds</small>
                </div>
                <div>
                  <span>Your average score</span>
                  <strong>
                    {average}
                    <small> / {RUBRIC_SCORE_MAX}</small>
                  </strong>
                  <small>Across your saved reviews</small>
                </div>
              </section>
              {projects.length > 0 ? (
                <>
                  <div className="history-tools">
                    <div
                      className="history-filters"
                      aria-label="Filter by round"
                    >
                      {(["all", "preliminary", "final"] as const).map(
                        (value) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={round === value}
                            onClick={() => setRound(value)}
                          >
                            {value === "all"
                              ? "All projects"
                              : value === "preliminary"
                                ? "Preliminary"
                                : "Final round"}
                          </button>
                        ),
                      )}
                    </div>
                    <input
                      type="search"
                      aria-label="Search judged projects"
                      placeholder="Search projects, teams, tracks…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <div className="history-list-caption" role="status">
                    <span>
                      {filtered.length}{" "}
                      {filtered.length === 1 ? "project" : "projects"}
                    </span>
                    <span>Most recently reviewed first</span>
                  </div>
                  {filtered.length ? (
                    <ul
                      className="history-project-list"
                      aria-label="Projects you judged"
                    >
                      {filtered.map((item) => {
                        const openPhase =
                          round === "all"
                            ? item.myReviews.at(-1)!.phase
                            : item.myReviews.find((r) => r.phase === round)!
                                .phase;
                        return (
                          <li key={item.id}>
                            <Link
                              className="history-project-row"
                              href={`${base}/judged/${encodeURIComponent(item.id)}?phase=${openPhase}`}
                              aria-label={`View your review of ${item.projectName}`}
                            >
                              <div
                                className="history-project-selfie"
                                role="img"
                                aria-label={
                                  item.teamPhotoUrl
                                    ? `Team selfie for ${item.projectName}`
                                    : `No team selfie submitted for ${item.projectName}`
                                }
                                style={
                                  item.teamPhotoUrl
                                    ? {
                                        backgroundImage: `url(${JSON.stringify(item.teamPhotoUrl)})`,
                                      }
                                    : undefined
                                }
                              >
                                {!item.teamPhotoUrl && (
                                  <span aria-hidden>
                                    {item.projectName.slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="history-row-project">
                                {item.teamName !== item.projectName && (
                                  <span className="history-team">
                                    {item.teamName}
                                  </span>
                                )}
                                <h2>{item.projectName}</h2>
                                <p className="history-one-liner">
                                  {item.oneLiner ||
                                    "Revisit this submission and your saved review."}
                                </p>
                                <div className="history-row-meta">
                                  <span>{item.track || "General"}</span>
                                  <time dateTime={item.reviewedAt || undefined}>
                                    {reviewedDate(item.reviewedAt)}
                                  </time>
                                </div>
                              </div>
                              <div className="history-personal-scores">
                                {item.myReviews.map((r) => (
                                  <div key={r.phase}>
                                    <span>
                                      Your{" "}
                                      {r.phase === "final"
                                        ? "final"
                                        : "preliminary"}{" "}
                                      score
                                    </span>
                                    <strong>
                                      {r.review.totalScore}
                                      <small> / {RUBRIC_SCORE_MAX}</small>
                                    </strong>
                                  </div>
                                ))}
                              </div>
                              <ResultSummary project={item} />
                              <span className="history-open-review" aria-hidden>
                                ↗
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <section className="history-empty">
                      <h2>No matching projects</h2>
                      <p>Try another search or round.</p>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setQuery("");
                          setRound("all");
                        }}
                      >
                        Clear filters
                      </button>
                    </section>
                  )}
                </>
              ) : (
                <section className="history-empty card">
                  <span className="history-empty-icon" aria-hidden>
                    ✓
                  </span>
                  <h2>Your reviews will live here</h2>
                  <p>
                    Once you submit a score, you can revisit the project
                    here—even while it’s waiting for another judge. Sign in with
                    the same name you used when judging.
                  </p>
                  <Link className="primary-button" href={`${base}/judging`}>
                    Go to judging <span aria-hidden>→</span>
                  </Link>
                </section>
              )}
            </>
          )
        )}
      </main>
    </AppShell>
  );
}
