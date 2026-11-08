"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./hill-climb.css";
import { AppShell } from "./AppShell";
import { LoadingScreen } from "./LoadingScreen";
import {
  EMPTY_HILL_RUN,
  hillClimbScore,
  validHillRun,
  type HillClimbRun,
  type HillClimbGrade,
} from "@/domain/hill-climb";
type Team = {
  id: string;
  teamName: string;
  teamNumber: string;
  projectName: string;
  description: string;
  grade: HillClimbGrade | null;
};
type Session = { name: string; role: "judge" | "admin"; hackathon?: string };
export function HillClimbView({
  hackathon,
  hackathonName,
  hackathonImageUrl,
}: {
  hackathon: string;
  hackathonName: string;
  hackathonImageUrl?: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState("");
  const [run, setRun] = useState<HillClimbRun>({ ...EMPTY_HILL_RUN });
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const api = `/api/hackathons/${hackathon}/hill-climb`;
  const key = (id: string, name = session?.name) =>
    `hackbuddy-hill:${hackathon}:${name}:${id}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const auth = await fetch("/api/auth/session", {
          signal: controller.signal,
        });
        if (auth.status === 401) {
          router.replace(`/${hackathon}`);
          return;
        }
        if (!auth.ok) throw new Error("Could not load your session.");
        const current: Session = await auth.json();
        if (current.role === "judge" && current.hackathon !== hackathon) {
          router.replace(`/${hackathon}`);
          return;
        }
        setSession(current);
        const response = await fetch(api, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setTeams(data.teams);
        setLocked(data.locked);
        setSelected("");
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error ? caught.message : "Could not load teams.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [api, hackathon, retry, router]);
  function selectTeam(id: string) {
    const team = teams.find((t) => t.id === id);
    let draft: HillClimbRun | null = null;
    try {
      const saved = JSON.parse(localStorage.getItem(key(id)) || "null");
      if (saved && saved.previousUpdatedAt === (team?.grade?.updatedAt ?? null))
        draft = saved.run;
    } catch {}
    setSelected(id);
    setRun(draft || team?.grade?.run || { ...EMPTY_HILL_RUN });
    setStatus(
      draft
        ? "Saved draft restored."
        : team?.grade
          ? "Your saved grade is loaded."
          : "",
    );
    setError("");
  }
  function update(fields: Partial<HillClimbRun>) {
    const next = { ...run, ...fields };
    if (!next.headToHead) next.tallerTower = false;
    setRun(next);
    try {
      localStorage.setItem(
        key(selected),
        JSON.stringify({
          run: next,
          previousUpdatedAt: team?.grade?.updatedAt ?? null,
        }),
      );
      setStatus("Draft saved on this device.");
    } catch {
      setStatus(
        "Draft could not be saved on this device. Keep this page open until you submit.",
      );
    }
  }
  const team = teams.find((t) => t.id === selected);
  const score = hillClimbScore(run);
  async function save() {
    if (!team || saving) return;
    if (!validHillRun(run)) {
      setError(
        "Check the stage order and run fields. Record a DQ if a later stage was attempted before passing the current stage.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: team.id,
          run,
          previousUpdatedAt: team.grade?.updatedAt ?? null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTeams((current) =>
        current.map((t) =>
          t.id === team.id ? { ...t, grade: data.grade } : t,
        ),
      );
      try {
        localStorage.removeItem(key(team.id));
      } catch {}
      setStatus("Grade saved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save this grade.",
      );
    } finally {
      setSaving(false);
    }
  }
  const number = (
    field: "cablesUnplugged" | "cablesPlugged" | "towerHeight" | "golfBalls",
    label: string,
    hint: string,
    max = 10000,
  ) => (
    <label className="field" key={field}>
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        step={field === "towerHeight" ? "any" : 1}
        required
        value={Number.isNaN(run[field]) ? "" : run[field]}
        onChange={(event) =>
          update({
            [field]:
              event.target.value === "" ? NaN : Number(event.target.value),
          })
        }
      />
      <small>{hint}</small>
    </label>
  );
  const check = (field: keyof HillClimbRun, label: string) => (
    <label className="field hill-run-check" key={field}>
      <span>
        <input
          type="checkbox"
          checked={Boolean(run[field])}
          onChange={(event) => update({ [field]: event.target.checked })}
        />{" "}
        {label}
      </span>
    </label>
  );
  if (loading) return <LoadingScreen />;
  return (
    <AppShell
      name={session?.name || ""}
      role={session?.role || "judge"}
      hackathon={hackathon}
      hackathonName={hackathonName}
      hackathonImageUrl={hackathonImageUrl}
    >
      <main className="workspace-main history-main">
        <header className="history-heading">
          <div>
            <span className="eyebrow">In-person evaluation</span>
            <h1>Hill Climb judging</h1>
            <p>
              Record each team’s relay run. Points are calculated from the
              tournament rubric.
            </p>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <button
          className="secondary-button"
          disabled={saving}
          onClick={() => setRetry((n) => n + 1)}
          type="button"
        >
          Reload teams
        </button>
        {locked && (
          <p role="status">
            Published results are locked. Saved grades are read-only.
          </p>
        )}
        {!teams.length ? (
          <section className="empty-state card">
            <h2>No Hill Climb teams yet</h2>
            <p>Teams appear here when they submit to the Hill Climb track.</p>
          </section>
        ) : (
          <>
            <label className="field" style={{ margin: "24px 0" }}>
              <span>Team</span>
              <select
                value={selected}
                disabled={saving}
                onChange={(event) => selectTeam(event.target.value)}
              >
                <option value="">Choose a team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.teamNumber ? `Team ${t.teamNumber} — ` : ""}
                    {t.teamName} — {t.projectName}
                    {t.grade
                      ? ` · ${t.grade.points} points${t.grade.automaticLoss ? " · Automatic loss" : ""}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            {team && (
              <form
                className="card hill-run-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <h2>
                  {team.teamNumber ? `Team ${team.teamNumber}: ` : ""}
                  {team.teamName}
                </h2>
                <p>{team.projectName}</p>
                {team.description && (
                  <details>
                    <summary>How the team improved the base model</summary>
                    <p>{team.description}</p>
                  </details>
                )}
                <p>
                  5-minute limit. Only the policy moves the robot after “go.” No
                  teleop, keyboard, voice input, or touching the robot or
                  objects.
                </p>
                <fieldset
                  disabled={locked || saving}
                  style={{ border: 0, padding: 0 }}
                >
                  <legend>Run scoring</legend>
                  {check("headToHead", "Head-to-head match (Sunday bracket)")}
                  <h3>1. Unplug</h3>
                  {number(
                    "cablesUnplugged",
                    "Cables unplugged from the hub",
                    "First cable: +10. Each additional cable: +5. At least one passes Stage 1.",
                  )}
                  {number(
                    "cablesPlugged",
                    "Loose cables plugged into free hub ports",
                    "+20 each, up to four. Do not plug an unplugged cable back in.",
                    4,
                  )}
                  <h3>2. Stack</h3>
                  {number(
                    "towerHeight",
                    "Final tower height (inches)",
                    "A passed tower earns +20, plus +3 per full inch of final height.",
                  )}
                  {check(
                    "towerStable",
                    "Tower reached at least 4 inches and stood freely for 3 seconds after release",
                  )}
                  {run.headToHead &&
                    check(
                      "tallerTower",
                      "This team’s passed tower was taller than the opponent’s at the end (+10; ties earn nothing)",
                    )}
                  <h3>3. Hungry Hungry Robots</h3>
                  {number(
                    "golfBalls",
                    "Golf balls resting inside the team’s bin at the end",
                    "+5 each. Both teams compete for the same balls. Balls that fell out do not count.",
                  )}
                  {check(
                    "blackBall",
                    "Either black 8-ball was in the team’s bin at the end (automatic loss)",
                  )}
                  <h3>Tools verified before the run</h3>
                  {check("liveKit", "Referee verified LiveKit (+10)")}
                  {check("dimensional", "Referee verified Dimensional (+5)")}
                  <h3>Disqualification</h3>
                  {check(
                    "skippedStage",
                    "Touched a later stage’s objects before passing the current stage",
                  )}
                  {check(
                    "humanTouch",
                    "A human touched the robot or an object after “go”",
                  )}
                  {check(
                    "humanInput",
                    "Teleop or any human input to the policy after “go,” including voice",
                  )}
                  <p>
                    A team member may call “stop” at any time. DQ scores 0 and
                    loses. An 8-ball is an automatic loss but keeps the points;
                    if both teams have a losing event, more points wins.
                  </p>
                  <p>
                    <strong aria-live="polite">
                      {Number.isFinite(score.points) ? score.points : "—"}{" "}
                      points
                      {score.disqualified
                        ? " · DQ · Automatic loss"
                        : score.automaticLoss
                          ? " · Automatic loss"
                          : ""}
                    </strong>
                  </p>
                  <p>
                    Cables: {score.breakdown.cables || 0} · Tower:{" "}
                    {score.breakdown.tower || 0} · Balls:{" "}
                    {score.breakdown.balls || 0} · Tools:{" "}
                    {score.breakdown.tools}
                  </p>
                  <button className="primary-button" type="submit">
                    {saving
                      ? "Saving…"
                      : team.grade
                        ? "Update grade"
                        : "Save grade"}
                  </button>
                </fieldset>
                <p role="status">{status}</p>
              </form>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
