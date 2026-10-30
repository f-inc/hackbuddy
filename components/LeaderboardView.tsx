"use client";

import { scoringPolicyLabel } from "@/domain/event-scoring";
import { FinalVotingPanel } from "@/components/FinalVotingPanel";
import { formatNormalizedScore } from "@/domain/normalization";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { SubmissionDetails } from "@/components/SubmissionDetails";
import { JUDGING_POLICY } from "@/domain/judging-policy";
import type { FinalistEntry, FinalsState, Submission } from "@/lib/types";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type FinalsResponse = {
  finals: FinalsState;
  error?: string;
};

const CONFETTI_COLORS = [
  "#f4c84a",
  "#f08b5d",
  "#ef5da8",
  "#6f79e8",
  "#23b6a5",
  "#46a4f2",
];

type ConfettiParticle = {
  age: number;
  color: string;
  drag: number;
  flip: number;
  flipSpeed: number;
  gravity: number;
  height: number;
  rotation: number;
  rotationSpeed: number;
  shape: "circle" | "rectangle";
  vx: number;
  vy: number;
  width: number;
  x: number;
  y: number;
};

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (
      !canvas ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    const drawingCanvas = canvas;
    const drawingContext = context;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let frame = 0;
    let nextBurst = 2_800;
    let followUpBursts = 0;
    const particles: ConfettiParticle[] = [];
    const startedAt = performance.now();
    let previousFrame = startedAt;
    const randomBetween = (minimum: number, maximum: number) =>
      minimum + Math.random() * (maximum - minimum);

    function resizeCanvas() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      drawingCanvas.width = Math.round(width * ratio);
      drawingCanvas.height = Math.round(height * ratio);
      drawingCanvas.style.width = `${width}px`;
      drawingCanvas.style.height = `${height}px`;
      drawingContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function fireCannon(side: "left" | "right", count: number, strength = 1) {
      const fromLeft = side === "left";
      const originX = fromLeft ? width * 0.015 : width * 0.985;
      const originY = height + randomBetween(32, 56);

      for (let index = 0; index < count; index += 1) {
        const gravity = randomBetween(500, 720);
        const travelTime = randomBetween(1.05, 2.2);
        const targetX = fromLeft
          ? width * randomBetween(0.16, 1.04)
          : width * randomBetween(-0.04, 0.84);
        const targetY = height * randomBetween(0.015, 0.6);
        const launchVx =
          ((targetX - originX) / travelTime + randomBetween(-90, 90)) *
          strength;
        const launchVy =
          ((targetY - originY - 0.5 * gravity * travelTime * travelTime) /
            travelTime +
            randomBetween(-100, 80)) *
          strength;
        particles.push({
          age: 0,
          color:
            CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          drag: randomBetween(0.9945, 0.9985),
          flip: randomBetween(0, Math.PI * 2),
          flipSpeed: randomBetween(5, 13) * (Math.random() > 0.5 ? 1 : -1),
          gravity,
          height: randomBetween(10, 20),
          rotation: randomBetween(0, Math.PI * 2),
          rotationSpeed: randomBetween(4, 12) * (Math.random() > 0.5 ? 1 : -1),
          shape: Math.random() > 0.82 ? "circle" : "rectangle",
          vx: launchVx,
          vy: launchVy,
          width: randomBetween(5, 11),
          x: originX + randomBetween(-12, 12),
          y: originY + randomBetween(-18, 18),
        });
      }
    }

    function draw(timestamp: number) {
      const elapsed = timestamp - startedAt;
      const delta = Math.min((timestamp - previousFrame) / 1000, 0.034);
      const frameScale = delta * 60;
      previousFrame = timestamp;

      while (elapsed >= nextBurst && followUpBursts < 2) {
        const burstSize = Math.floor(randomBetween(72, 94));
        fireCannon("left", burstSize, 0.94);
        fireCannon("right", burstSize, 0.94);
        followUpBursts += 1;
        nextBurst += 2_800;
      }

      drawingContext.clearRect(0, 0, width, height);
      const endingOpacity =
        elapsed > 9_150 ? Math.max(0, (10_000 - elapsed) / 850) : 1;

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.age += delta;
        particle.vx *= Math.pow(particle.drag, frameScale);
        particle.vy += particle.gravity * delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.rotation += particle.rotationSpeed * delta;
        particle.flip += particle.flipSpeed * delta;

        if (
          particle.y > height + 80 ||
          particle.x < -320 ||
          particle.x > width + 320
        ) {
          particles.splice(index, 1);
          continue;
        }

        const flipScale = Math.max(0.12, Math.abs(Math.cos(particle.flip)));
        const entryOpacity = Math.min(1, particle.age * 8);
        drawingContext.save();
        drawingContext.globalAlpha = entryOpacity * endingOpacity;
        drawingContext.translate(particle.x, particle.y);
        drawingContext.rotate(particle.rotation);
        drawingContext.scale(1, flipScale);
        drawingContext.fillStyle = particle.color;
        if (particle.shape === "circle") {
          drawingContext.beginPath();
          drawingContext.arc(0, 0, particle.width * 0.58, 0, Math.PI * 2);
          drawingContext.fill();
        } else {
          drawingContext.fillRect(
            particle.width * -0.5,
            particle.height * -0.5,
            particle.width,
            particle.height,
          );
        }
        drawingContext.restore();
      }

      if (elapsed < 10_000) {
        frame = window.requestAnimationFrame(draw);
      }
    }

    resizeCanvas();
    fireCannon("left", 145, 1.12);
    fireCannon("right", 145, 1.12);
    window.addEventListener("resize", resizeCanvas);
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  return (
    <canvas aria-hidden className="confetti-celebration" ref={canvasRef} />
  );
}

export function LeaderboardView({
  hackathon,
  hackathonName,
  hackathonImageUrl,
}: {
  hackathon?: string;
  hackathonName?: string;
  hackathonImageUrl?: string;
}) {
  const apiBase = hackathon ? `/api/hackathons/${hackathon}` : "/api";
  const [name, setName] = useState("");
  const [role, setRole] = useState<"judge" | "admin">("judge");
  const [finals, setFinals] = useState<FinalsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [presenting, setPresenting] = useState(false);
  const [showAllFinalists, setShowAllFinalists] = useState(false);
  const [selectedFinalist, setSelectedFinalist] =
    useState<FinalistEntry | null>(null);
  const [inspectingId, setInspectingId] = useState("");
  const [inspectedSubmission, setInspectedSubmission] =
    useState<Submission | null>(null);
  const [inspectionError, setInspectionError] = useState("");
  const [selectedJudges, setSelectedJudges] = useState<string[]>([]);
  const [newJudgeName, setNewJudgeName] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const [confettiRun, setConfettiRun] = useState(0);
  const [ceremonyMode, setCeremonyMode] = useState(false);
  const [revealStage, setRevealStage] = useState(3);
  const rosterInitialized = useRef(false);
  const ceremonyTimer = useRef<number | null>(null);

  const launchConfetti = useCallback(() => {
    if (ceremonyTimer.current) {
      window.clearTimeout(ceremonyTimer.current);
    }
    setCelebrating(true);
    setConfettiRun((current) => current + 1);
    ceremonyTimer.current = window.setTimeout(() => {
      setCelebrating(false);
      ceremonyTimer.current = null;
    }, 10_000);
  }, []);

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await fetch(`${apiBase}/finals`);
        if (response.status === 401) {
          window.location.href = hackathon ? `/${hackathon}` : "/";
          return;
        }
        const data = (await response.json()) as FinalsResponse;
        if (!response.ok) throw new Error(data.error);
        setFinals(data.finals);
        if (!data.finals.started && !rosterInitialized.current) {
          setSelectedJudges(data.finals.judges);
          rosterInitialized.current = true;
        }
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
          ? `/${session.hackathon}/leaderboard`
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
    const interval = window.setInterval(() => void refresh(true), 10_000);
    return () => window.clearInterval(interval);
  }, [hackathon, refresh]);

  useEffect(() => {
    function syncFullscreenState() {
      if (!document.fullscreenElement) {
        setPresenting(false);
        setCelebrating(false);
        setCeremonyMode(false);
        setRevealStage(3);
      }
    }
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(
    () => () => {
      if (ceremonyTimer.current) {
        window.clearTimeout(ceremonyTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!presenting) return;

    function leavePresentationOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (ceremonyTimer.current) {
        window.clearTimeout(ceremonyTimer.current);
        ceremonyTimer.current = null;
      }
      setCelebrating(false);
      setCeremonyMode(false);
      setRevealStage(3);
      setPresenting(false);
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      }
    }

    document.addEventListener("keydown", leavePresentationOnEscape);
    return () =>
      document.removeEventListener("keydown", leavePresentationOnEscape);
  }, [presenting]);

  useEffect(() => {
    if (
      !presenting ||
      role !== "admin" ||
      !finals?.publishedAt ||
      showAllFinalists
    ) {
      return;
    }

    function handleRevealKey(event: KeyboardEvent) {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (revealStage >= 3) return;
        const nextStage = revealStage + 1;
        setRevealStage(nextStage);
        if (nextStage === 3) launchConfetti();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (ceremonyTimer.current) {
          window.clearTimeout(ceremonyTimer.current);
          ceremonyTimer.current = null;
        }
        setCelebrating(false);
        setRevealStage((current) => Math.max(0, current - 1));
      }
    }

    document.addEventListener("keydown", handleRevealKey);
    return () => document.removeEventListener("keydown", handleRevealKey);
  }, [
    finals?.publishedAt,
    launchConfetti,
    presenting,
    revealStage,
    role,
    showAllFinalists,
  ]);

  useEffect(() => {
    if (!selectedFinalist && !inspectingId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedFinalist(null);
        setInspectingId("");
        setInspectedSubmission(null);
        setInspectionError("");
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [inspectingId, selectedFinalist]);

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
    setInspectingId("");
    setInspectedSubmission(null);
    setInspectionError("");
  }

  async function togglePresentation() {
    if (presenting) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setPresenting(false);
      setCelebrating(false);
      setCeremonyMode(false);
      setRevealStage(3);
      return;
    }

    if (role === "admin" && finals?.publishedAt && !showAllFinalists) {
      if (ceremonyTimer.current) {
        window.clearTimeout(ceremonyTimer.current);
        ceremonyTimer.current = null;
      }
      setCelebrating(false);
      setCeremonyMode(true);
      setRevealStage(0);
    }
    setPresenting(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // The fixed presentation layout still works if fullscreen is unavailable.
    }
  }

  async function startFinals() {
    if (!selectedJudges.length) {
      setError("Select at least one final-round judge.");
      return;
    }
    const confirmed = window.confirm(
      `Start final judging with ${selectedJudges.length} judges and ${finals?.finalists.length || 0} teams? This freezes the current finalists and judge roster.`,
    );
    if (!confirmed) return;
    setStarting(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judges: selectedJudges }),
      });
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

  async function syncFinalists() {
    const confirmed = window.confirm(
      `Replace the frozen finalists with the current first ${JUDGING_POLICY.finals.finalistCount} rows from Results?`,
    );
    if (!confirmed) return;
    setSyncing(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = (await response.json()) as FinalsResponse;
      if (!response.ok) throw new Error(data.error);
      setFinals(data.finals);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not synchronize the finalists.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function publishFinals() {
    if (
      !window.confirm(
        "Publish and permanently lock these rankings and scores? Score edits, finalist changes, and resets will be disabled.",
      )
    )
      return;
    setPublishing(true);
    try {
      const response = await fetch(`${apiBase}/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const data = (await response.json()) as FinalsResponse;
      if (!response.ok)
        throw new Error(data.error || "Results could not be published.");
      setFinals(data.finals);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Results could not be published.",
      );
    } finally {
      setPublishing(false);
    }
  }

  async function resetFinals() {
    const confirmed = window.confirm(
      "Reset final judging? This permanently clears the finalist cohort, final-round scores, and final judge roster for this hackathon.",
    );
    if (!confirmed) return;
    setResetting(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = (await response.json()) as FinalsResponse;
      if (!response.ok) throw new Error(data.error);
      setFinals(data.finals);
      setSelectedJudges(data.finals.judges);
      rosterInitialized.current = true;
      setShowAllFinalists(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reset final judging.",
      );
    } finally {
      setResetting(false);
    }
  }

  function toggleJudge(judge: string, selected: boolean) {
    setSelectedJudges((current) =>
      selected
        ? Array.from(new Set([...current, judge])).sort()
        : current.filter((name) => name !== judge),
    );
  }

  function addJudge(event: FormEvent) {
    event.preventDefault();
    const normalized = newJudgeName.trim().toLowerCase();
    if (!normalized) return;
    toggleJudge(normalized, true);
    setNewJudgeName("");
  }

  if (!name || loading || !finals) return <LoadingScreen />;

  const finalState = finals;
  const results =
    Boolean(finalState.publishedAt) && !showAllFinalists
      ? finalState.topThree
      : finalState.finalists;
  const showingTopThree = Boolean(finalState.publishedAt) && !showAllFinalists;
  const heading = Boolean(finalState.publishedAt)
    ? showAllFinalists
      ? "Final judging"
      : `Top ${JUDGING_POLICY.finals.winnerCount} finalists`
    : `Top ${JUDGING_POLICY.finals.finalistCount} teams`;
  const availableJudgeNames = Array.from(
    new Set([...finalState.judges, ...selectedJudges]),
  ).sort();

  function finalistContent(result: FinalistEntry) {
    return (
      <>
        <div className="tv-project">
          <strong>{result.projectName}</strong>
          <span>{result.oneLiner || result.teamName}</span>
          {finalState.scoringPolicy === "normalized-v1" &&
            !(showingTopThree && finalState.votingMode === "podium-v1") && (
              <small className="normalized-finalist-score">
                {formatNormalizedScore(
                  showingTopThree
                    ? result.finalNormalizedScore
                    : result.normalizedScore,
                )}{" "}
                · {showingTopThree ? "Final" : "Preliminary"} normalized
              </small>
            )}
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
        {finalState.started && !finalState.publishedAt && (
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
      className={`tv-leaderboard${presenting ? " is-presenting" : ""}${
        showingTopThree ? " is-top-three" : ""
      }`}
      id="top-ten-leaderboard"
    >
      {showingTopThree && celebrating && (
        <ConfettiCanvas key={`confetti-${confettiRun}`} />
      )}
      <header className="tv-leaderboard-header">
        <div className="tv-leaderboard-title">
          <span aria-hidden className="brand-mark small" />
          <div>
            <span className="eyebrow">{hackathonName || "HackBuddy"}</span>
            <h1>{heading}</h1>
          </div>
        </div>
        <div className="tv-leaderboard-actions">
          <span className="results-live">
            <span />
            {finalState.publishedAt
              ? "Published and locked"
              : "Live · refreshes every 10 seconds"}
          </span>
          <button
            className="secondary-button tv-present-button"
            onClick={togglePresentation}
            type="button"
          >
            {presenting ? "Exit presentation" : "Present on TV"}
            <span aria-hidden>{presenting ? "↙" : "↗"}</span>
          </button>
          {Boolean(finalState.publishedAt) && !presenting && (
            <button
              className="secondary-button tv-present-button"
              onClick={() => setShowAllFinalists((current) => !current)}
              type="button"
            >
              {showAllFinalists
                ? `Show top ${JUDGING_POLICY.finals.winnerCount}`
                : "Review all finalists"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="error-banner page-error">{error}</div>}

      <p>
        {scoringPolicyLabel(finalState.scoringPolicy)} · Fixed for this event
        {finalState.publishedAt
          ? ` · Published ${new Date(finalState.publishedAt).toLocaleString()}`
          : ""}
      </p>
      <section className="final-round-status">
        <div className="final-round-status-label">
          <span
            className={`final-round-dot${finalState.started ? " live" : ""}`}
          />
          <strong>
            {finalState.publishedAt
              ? "Results published and locked"
              : finalState.started
                ? Boolean(finalState.publishedAt)
                  ? "Final judging complete · awaiting publication"
                  : "Final judging is live"
                : "Final judging has not started"}
          </strong>
        </div>
        <div className="final-round-status-meta">
          <p>
            {finalState.started
              ? role === "admin"
                ? `${finalState.completedReviews} of ${finalState.requiredReviews} ballots submitted.`
                : "Choose your top three finalists and submit your ballot below."
              : role === "admin"
                ? finalState.canStart
                  ? `Starting will freeze these teams and include ${finalState.judges.length} preliminary judges.`
                  : "Final judging can start after at least three projects receive completed preliminary scores."
                : "An administrator will start the final round when presentations begin."}
          </p>
          {finalState.started &&
            role === "admin" &&
            !finalState.publishedAt && (
              <div className="final-round-admin-actions">
                {finalState.votingMode !== "podium-v1" &&
                  finals.allComplete && (
                    <button
                      className="normalization-compare"
                      type="button"
                      disabled={publishing}
                      onClick={publishFinals}
                    >
                      {publishing ? "Publishing…" : "Publish and lock results"}
                    </button>
                  )}
                {finalState.completedReviews === 0 && (
                  <button
                    className="final-sync-button"
                    disabled={syncing}
                    onClick={syncFinalists}
                    title={`Replace finalists with the current first ${JUDGING_POLICY.finals.finalistCount} rows from Results`}
                    type="button"
                  >
                    {syncing
                      ? "Syncing…"
                      : `Sync Top ${JUDGING_POLICY.finals.finalistCount}`}
                  </button>
                )}
                <button
                  className="final-reset-button"
                  disabled={resetting}
                  onClick={resetFinals}
                  title="Clear finalists, final scores, and the final judge roster"
                  type="button"
                >
                  {resetting ? "Resetting…" : "Reset finals"}
                </button>
              </div>
            )}
        </div>
      </section>

      {!presenting && !finalState.started && role === "admin" && (
        <section
          aria-labelledby="final-roster-title"
          className="final-judge-roster card"
        >
          <div className="final-roster-header">
            <div>
              <span className="eyebrow">Admin setup</span>
              <h2 id="final-roster-title">Final judge roster</h2>
              <p>
                Choose who can vote on the Top{" "}
                {JUDGING_POLICY.finals.finalistCount} team. This roster locks
                when final judging starts.
              </p>
            </div>
            <span className="final-roster-count">
              {selectedJudges.length} selected
            </span>
          </div>

          <div className="final-roster-options">
            {availableJudgeNames.map((judge) => {
              const selected = selectedJudges.includes(judge);
              const detected = finalState.judges.includes(judge);
              return (
                <label
                  className={`final-judge-option${selected ? " selected" : ""}`}
                  key={judge}
                >
                  <input
                    checked={selected}
                    onChange={(event) =>
                      toggleJudge(judge, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span className="judge-chip">
                    {judge.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{judge}</strong>
                    <small>
                      {detected ? "Preliminary judge" : "Added manually"}
                    </small>
                  </span>
                  <b aria-hidden>{selected ? "✓" : ""}</b>
                </label>
              );
            })}
          </div>

          <form className="final-add-judge" onSubmit={addJudge}>
            <label htmlFor="new-final-judge">Add another login name</label>
            <div>
              <input
                autoCapitalize="none"
                autoComplete="off"
                id="new-final-judge"
                onChange={(event) => setNewJudgeName(event.target.value)}
                placeholder="e.g. maya chen"
                value={newJudgeName}
              />
              <button
                className="secondary-button"
                disabled={!newJudgeName.trim()}
                type="submit"
              >
                Add judge
              </button>
            </div>
            <small>
              Names must match what each judge enters at sign-in. Capitalization
              does not matter.
            </small>
          </form>

          <div className="final-roster-actions">
            <p>
              {finalState.canStart
                ? `${selectedJudges.length} judges will each choose a podium from ${finalState.finalists.length} finalists.`
                : "Final judging can start after at least three projects receive completed preliminary scores."}
            </p>
            <button
              className="primary-button tv-start-button"
              disabled={
                starting || !finalState.canStart || !selectedJudges.length
              }
              onClick={startFinals}
              type="button"
            >
              {starting ? "Starting…" : "Confirm roster & start finals"}
              {!starting && <span aria-hidden>→</span>}
            </button>
          </div>
        </section>
      )}

      {finalState.started && !finalState.publishedAt && !presenting && (
        <FinalVotingPanel
          key={`${finalState.startedAt}:${finalState.ownBallot?.submittedAt ?? "draft"}`}
          finals={finalState}
          admin={role === "admin"}
          apiBase={apiBase}
          onInspect={(id) => void inspectSubmission(id)}
          onUpdate={setFinals}
        />
      )}
      {finalState.started &&
      !finalState.publishedAt &&
      !presenting ? null : results.length ? (
        <ol
          className={`tv-ranking${showingTopThree ? " top-three-ranking" : ""}`}
        >
          {results.map((result, index) => (
            <li
              className={`${result.reviewedByYou ? "reviewed-by-you" : ""}${
                showingTopThree
                  ? ` podium-place podium-place-${index + 1}${
                      ceremonyMode
                        ? revealStage >= 3 - index
                          ? " ceremony-revealed"
                          : " ceremony-pending"
                        : ""
                    }`
                  : ""
              }`}
              key={result.id}
            >
              <div className="tv-finalist-card is-clickable">
                <button
                  aria-label={`View ${result.projectName} submission`}
                  className="tv-finalist-open"
                  onClick={() => void inspectSubmission(result.id)}
                  type="button"
                />
                {showingTopThree && (
                  <span
                    aria-label={
                      index === 0
                        ? "First place"
                        : index === 1
                          ? "Second place"
                          : "Third place"
                    }
                    className="podium-mark"
                  >
                    <span className="podium-trophy" aria-hidden>
                      <svg viewBox="0 0 24 24">
                        <path d="M8 4h8v4.5a4 4 0 0 1-8 0V4Z" />
                        <path d="M8 6H4v1.25A3.75 3.75 0 0 0 7.75 11M16 6h4v1.25A3.75 3.75 0 0 1 16.25 11M12 12.5V17M8.5 20h7M10 17h4" />
                      </svg>
                    </span>
                    <span>
                      <strong>{index + 1}</strong>
                      <small>
                        {index === 0
                          ? "Champion"
                          : index === 1
                            ? "Runner-up"
                            : "Third place"}
                      </small>
                    </span>
                  </span>
                )}
                {finalistContent(result)}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <section className="tv-empty card">
          <span>★</span>
          <h2>Results are coming</h2>
          <p>
            The top {JUDGING_POLICY.finals.finalistCount} will appear as
            projects finish all {JUDGING_POLICY.preliminary.requiredReviews}{" "}
            reviews.
          </p>
        </section>
      )}

      <footer className="tv-leaderboard-footer">
        <span>HackBuddy</span>
        <span>
          {Boolean(finalState.publishedAt) && !showAllFinalists
            ? `${JUDGING_POLICY.finals.winnerCount} winners confirmed by the organizer`
            : `${results.length} finalist teams shown`}
        </span>
      </footer>
    </main>
  );

  return (
    <AppShell
      hackathon={hackathon}
      hackathonImageUrl={hackathonImageUrl}
      hackathonName={hackathonName}
      name={name}
      role={role}
    >
      {board}
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
                <span className="eyebrow">Finalist submission</span>
                <strong>
                  {inspectedSubmission?.projectName || "Loading project…"}
                </strong>
              </div>
              <div className="submission-inspection-header-actions">
                <button
                  aria-label="Close submission preview"
                  onClick={closeInspection}
                  type="button"
                >
                  ×
                </button>
              </div>
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
