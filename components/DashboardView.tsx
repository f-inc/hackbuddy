"use client";

import { formatNormalizedScore } from "@/domain/normalization";
import type { ScoringPolicy } from "@/domain/event-scoring";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  RUBRIC_SCORE_MAX,
  PRELIMINARY_SCORE_MAX,
} from "@/domain/judging-policy";
import type {
  ActiveSession,
  LeaderboardEntry,
  QueueStats,
  ScoreDistributionBucket,
} from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

type DashboardData = {
  scoringPolicy: ScoringPolicy;
  publishedAt: string;
  stats: QueueStats;
  leaderboard: LeaderboardEntry[];
  activeSessions: ActiveSession[];
  scoreDistribution: ScoreDistributionBucket[];
  averageScore: number;
  yourCompleted: number;
  yourAverageScore: number;
  eligibleAvailable: number;
  hasActiveReview: boolean;
  demoMode: boolean;
  error?: string;
};

const emptyData: DashboardData = {
  scoringPolicy: "raw-v1",
  publishedAt: "",
  stats: { total: 0, available: 0, inProgress: 0, completed: 0 },
  leaderboard: [],
  activeSessions: [],
  scoreDistribution: [],
  averageScore: 0,
  yourCompleted: 0,
  yourAverageScore: 0,
  eligibleAvailable: 0,
  hasActiveReview: false,
  demoMode: false,
};

function timeAgo(value: string) {
  if (!value) return "Just now";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function DashboardView({
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
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await fetch(`${apiBase}/dashboard`);
        if (response.status === 401) {
          window.location.href = hackathon ? `/${hackathon}` : "/";
          return;
        }
        const result = (await response.json()) as DashboardData;
        if (!response.ok) throw new Error(result.error);
        setData(result);
        setError("");
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load the dashboard.",
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
          ? `/${session.hackathon}/dashboard`
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

  if (!name || loading) return <LoadingScreen />;

  const completion = data.stats.total
    ? Math.round((data.stats.completed / data.stats.total) * 100)
    : 0;
  const largestScoreBucket = Math.max(
    1,
    ...data.scoreDistribution.map((bucket) => bucket.count),
  );
  const scoredSubmissionCount = data.scoreDistribution.reduce(
    (total, bucket) => total + bucket.count,
    0,
  );
  const remainingReviews = Math.max(0, data.stats.total - data.stats.completed);
  const queueComplete = data.stats.total > 0 && remainingReviews === 0;
  const judgeHasWork = data.hasActiveReview || data.eligibleAvailable > 0;

  return (
    <AppShell
      hackathon={hackathon}
      hackathonImageUrl={hackathonImageUrl}
      hackathonName={hackathonName}
      name={name}
      role={role}
    >
      {data.demoMode && (
        <div className="demo-banner">
          Preview mode — add Airtable credentials to use live submissions.
        </div>
      )}
      <main className="workspace-main dashboard-main">
        <section
          className={`page-heading${role === "judge" ? " judge-page-heading" : ""}`}
        >
          <div className="dashboard-event-heading">
            {hackathonImageUrl && (
              <span
                aria-label={`${hackathonName || "Hackathon"} artwork`}
                className="dashboard-event-image"
                role="img"
                style={{
                  backgroundImage: `url("${hackathonImageUrl}")`,
                }}
              />
            )}
            <div>
              {hackathonName && (
                <span className="eyebrow">{hackathonName}</span>
              )}
              <h1>{role === "admin" ? "Dashboard" : "Judging queue"}</h1>
              <p>
                {role === "admin"
                  ? `Welcome back, ${name}. Here’s what’s happening in the judging room.`
                  : "See what still needs your attention."}
              </p>
            </div>
          </div>
          {role === "admin" && (
            <a
              className="primary-button link-button"
              href={`${pageBase}/judging`}
            >
              Start judging <span>→</span>
            </a>
          )}
        </section>

        {error && <div className="error-banner page-error">{error}</div>}

        {role === "admin" ? (
          <>
            <section className="score-overview card">
              <div className="score-overview-copy">
                <span className="eyebrow">Score distribution</span>
                <div className="score-average">
                  <strong>{data.averageScore || "—"}</strong>
                  <span>
                    <small>/ {RUBRIC_SCORE_MAX}</small>
                    Current average
                  </span>
                </div>
                <p>
                  {scoredSubmissionCount
                    ? `Across ${scoredSubmissionCount} completed ${
                        scoredSubmissionCount === 1
                          ? "submission"
                          : "submissions"
                      }`
                    : "Scores will appear as reviews are completed"}
                </p>
              </div>

              <div
                aria-label="Distribution of completed submission scores"
                className="distribution-chart"
                role="img"
              >
                <div className="chart-grid-lines" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
                {data.scoreDistribution.map((bucket, index) => (
                  <div className="distribution-column" key={bucket.label}>
                    <span className="distribution-count">
                      {bucket.count || ""}
                    </span>
                    <div className="distribution-track">
                      <span
                        className="distribution-bar"
                        style={
                          {
                            "--bar-height": `${Math.max(
                              bucket.count ? 12 : 2,
                              (bucket.count / largestScoreBucket) * 100,
                            )}%`,
                            "--bar-delay": `${index * 35}ms`,
                          } as React.CSSProperties
                        }
                      />
                    </div>
                    <span className="distribution-label">{bucket.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="metric-grid metric-grid-secondary">
              <article className="metric-card card">
                <span>Completed reviews</span>
                <div>
                  <strong>{scoredSubmissionCount}</strong>
                </div>
                <p>Scores included in the distribution</p>
              </article>
              <article className="metric-card card">
                <span>Collective queue progress</span>
                <div>
                  <strong>{completion}%</strong>
                </div>
                <div className="metric-progress">
                  <span style={{ width: `${completion}%` }} />
                </div>
                <p>
                  {data.stats.completed} of {data.stats.total} completed
                </p>
              </article>
              <article className="metric-card card">
                <span>Active sessions</span>
                <div>
                  <strong>{data.stats.inProgress}</strong>
                </div>
                <p>{data.stats.available} projects waiting in the queue</p>
              </article>
              <article className="metric-card card">
                <span>Administrator tools</span>
                <div>
                  <strong>{data.activeSessions.length}</strong>
                </div>
                <p>Active sessions available to inspect or release</p>
              </article>
            </section>

            <section className="dashboard-panels">
              <article className="card panel-card">
                <div className="section-header">
                  <div>
                    <h2>Active judging sessions</h2>
                    <p>Projects currently reserved by a judge.</p>
                  </div>
                  <span className="live-indicator">
                    <span />
                    Live
                  </span>
                </div>

                {data.activeSessions.length ? (
                  <div className="session-list">
                    {data.activeSessions.map((session) => (
                      <div className="session-row" key={session.id}>
                        <span className="session-avatar">
                          {session.judgeName.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="session-project">
                          <strong>{session.projectName}</strong>
                          <span>{session.teamName}</span>
                        </div>
                        <div className="session-judge">
                          <strong>{session.judgeName || "judge"}</strong>
                          <span>{timeAgo(session.claimedAt)}</span>
                        </div>
                        <span className="table-status in-progress">
                          In progress
                        </span>
                        <a
                          className="inspect-session"
                          href={`${pageBase}/judging?submission=${encodeURIComponent(session.id)}`}
                        >
                          Inspect
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="panel-empty">
                    <span>○</span>
                    <h3>No active sessions</h3>
                    <p>The next claimed project will appear here.</p>
                  </div>
                )}
              </article>

              <article className="card panel-card scores-panel">
                <div className="section-header">
                  <div>
                    <h2>Current scores</h2>
                    <p>
                      {data.publishedAt
                        ? "Published and locked rankings."
                        : data.scoringPolicy === "normalized-v1"
                          ? "Ranked by normalized scores. Zero is neutral; higher is better."
                          : "Original raw scoring for this event."}
                    </p>
                  </div>
                </div>

                {data.leaderboard.length ? (
                  <ol className="leaderboard-list">
                    {data.leaderboard.map((entry) => (
                      <li key={entry.id}>
                        <span className="rank">{entry.rank}</span>
                        <div>
                          <strong>{entry.projectName}</strong>
                          <span>{entry.teamName}</span>
                        </div>
                        <b>
                          {data.scoringPolicy === "normalized-v1"
                            ? formatNormalizedScore(entry.score)
                            : entry.score}
                          <small>
                            {data.scoringPolicy === "normalized-v1"
                              ? " normalized"
                              : `/${PRELIMINARY_SCORE_MAX}`}
                          </small>
                        </b>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="panel-empty compact">
                    <span>—</span>
                    <h3>No scores yet</h3>
                    <p>Scores appear after the first completed review.</p>
                  </div>
                )}
              </article>
            </section>
          </>
        ) : (
          <section className="judge-dashboard-focus card">
            <header>
              <span
                className={`judge-work-status ${
                  queueComplete
                    ? "complete"
                    : judgeHasWork
                      ? "ready"
                      : "waiting"
                }`}
              >
                <span />
                {queueComplete
                  ? "Judging complete"
                  : judgeHasWork
                    ? "Projects need judging"
                    : "Nothing available right now"}
              </span>
              <strong>{completion}% complete</strong>
            </header>

            <div className="judge-focus-copy">
              <h2>
                {queueComplete
                  ? "The queue is complete."
                  : judgeHasWork
                    ? data.hasActiveReview
                      ? "Your current review is waiting."
                      : `${data.eligibleAvailable} ${
                          data.eligibleAvailable === 1 ? "project" : "projects"
                        } ready to judge.`
                    : data.stats.inProgress
                      ? "You’re caught up for now."
                      : "Waiting for submissions."}
              </h2>
              <p>
                {queueComplete
                  ? "Every submitted project has received a score."
                  : judgeHasWork
                    ? data.hasActiveReview
                      ? "Continue where you left off and submit your score."
                      : "Pick up the next submission and keep the queue moving."
                    : data.stats.inProgress
                      ? `${data.stats.inProgress} ${
                          data.stats.inProgress === 1
                            ? "project is"
                            : "projects are"
                        } currently being reviewed by other judges.`
                      : "New projects will appear here as soon as they enter the queue."}
              </p>
            </div>

            <div
              aria-label={`${completion}% of judging complete`}
              className="judge-progress-track"
              role="progressbar"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={completion}
            >
              <span style={{ width: `${completion}%` }} />
            </div>

            <footer>
              <span>
                <strong>{data.stats.completed}</strong> of{" "}
                <strong>{data.stats.total}</strong> submissions reviewed
              </span>
              {judgeHasWork ? (
                <a
                  className="primary-button link-button"
                  href={`${pageBase}/judging`}
                >
                  {data.hasActiveReview
                    ? "Continue judging"
                    : "Judge next project"}{" "}
                  <span>→</span>
                </a>
              ) : queueComplete ? (
                <a
                  className="secondary-button link-button"
                  href={`${pageBase}/results`}
                >
                  View results <span>→</span>
                </a>
              ) : null}
            </footer>
          </section>
        )}
      </main>
    </AppShell>
  );
}
