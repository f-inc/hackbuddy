"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { JudgePhaseGallery } from "./EventFlow";
import { FlowPresentation } from "./FlowPresentation";
import type {
  Draft,
  EventView,
  Project,
  StudioActor,
} from "@/domain/studio/model";
import {
  api,
  flowSectionFromUrl,
  setFlowUrl,
  Empty,
  ErrorMessage,
  Field,
  Frame,
  judgeApi,
  Progress,
  ProjectIcon,
} from "./shared";
type Info = {
  id: string;
  slug: string;
  name: string;
  description: string;
  stage: string;
  hasGallery: boolean;
};
type Claim = { project: Project | null; draft: Draft | null };
export function JudgeApp({ slug }: { slug: string }) {
  const [screen, setScreen] = useState<string | null>(null);
  const selectScreen = (section: string) => {
    setScreen(section);
    setFlowUrl(section);
  };
  useEffect(() => {
    const sync = () => {
      const requested = flowSectionFromUrl();
      setScreen(
        requested &&
          [
            "First pass judging",
            "Top finalists",
            "Second pass judging",
            "Winners",
          ].includes(requested)
          ? requested
          : null,
      );
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const [info, setInfo] = useState<Info | null>(null),
    [view, setView] = useState<EventView | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [name, setName] = useState("");
  const load = useCallback(async (id: string) => {
    const v = await judgeApi<EventView>(`events/${id}`);
    setView(v);
  }, []);
  useEffect(() => {
    let alive = true;
    api<Info>(`info/${slug}`)
      .then(async (i) => {
        if (!alive) return;
        setName(new URLSearchParams(location.search).get("name") || "");
        setInfo(i);
        const requested = new URLSearchParams(location.search).get("view");
        setScreen(
          requested === "first-pass"
            ? "First pass judging"
            : requested === "top-seven"
              ? "Top finalists"
              : requested === "second-pass"
                ? "Second pass judging"
                : requested === "winners"
                  ? "Winners"
                  : null,
        );
        try {
          const s = await judgeApi<{ actor: StudioActor }>("session");
          if (s.actor.eventId === i.id) await load(i.id);
        } catch {}
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, [slug, load]);
  useEffect(() => {
    if (!view?.actor.judgeId || !info) return;
    const timer = setInterval(() => {
      if (!document.hidden) load(info.id).catch((e) => setError(e.message));
    }, 5000);
    return () => clearInterval(timer);
  }, [view?.actor.judgeId, info, load]);
  async function login(form: FormData) {
    setBusy(true);
    setError("");
    try {
      await api(`join/${slug}`, { name, password: form.get("password") });
      await load(info!.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <Frame className="s-screen s-judge-screen" label="Judge’s desk">
        <main className="s-container s-loading">Finding your event…</main>
      </Frame>
    );
  if (!info)
    return (
      <Frame>
        <main className="s-container">
          <ErrorMessage message={error} />
        </main>
      </Frame>
    );
  if (!view)
    return (
      <Frame className="s-screen s-judge-screen" label="Judge’s desk">
        <main className="s-judge-login">
          <div>
            <span className="s-eyebrow">You’re invited to judge</span>
            <h1>{info.name}</h1>
            <p>{info.description}</p>
          </div>
          <form className="s-panel s-form" action={login}>
            <h2>Take your seat.</h2>
            <p>Just your name and the event password from your organizer.</p>
            <Field label="Your name">
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </Field>
            <Field label="Event password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <ErrorMessage message={error} />
            <button
              className="s-inverse"
              disabled={busy || ["draft", "archived"].includes(info.stage)}
            >
              {busy ? "Joining…" : "Join the judging room ↗"}
            </button>
            {["draft", "archived"].includes(info.stage) && (
              <p>
                This event is{" "}
                {info.stage === "draft" ? "still being set up" : "archived"}.
              </p>
            )}
            {info.hasGallery && (
              <Link href={`/showcase/${slug}`}>Explore the projects ↗</Link>
            )}
          </form>
        </main>
      </Frame>
    );
  const e = view.event;
  const currentScreen =
    screen ||
    (["published", "archived"].includes(e.stage)
      ? "Winners"
      : e.stage === "final"
        ? "Second pass judging"
        : "First pass judging");
  return (
    <Frame
      className="s-screen s-judge-screen"
      label="Judge’s desk"
      actions={
        <>
          <span>{view.actor.name}</span>
          <button
            onClick={async () => {
              await api("session", { action: "logout", judge: true });
              setView(null);
            }}
          >
            Leave desk
          </button>
        </>
      }
    >
      <main className="s-container s-judge-container">
        <div className="s-page-heading">
          <div>
            <span className="s-eyebrow">
              {e.name} ·{" "}
              {currentScreen === "Top finalists"
                ? `Top ${e.rules.finalistCount}`
                : currentScreen}
            </span>
            <h1>
              {currentScreen === "Top finalists"
                ? `Top ${e.rules.finalistCount}`
                : currentScreen}
            </h1>
          </div>
          <div className="s-actions">
            {["First pass judging", "Second pass judging"].includes(
              currentScreen,
            ) && (
              <FlowPresentation
                eventName={e.name}
                title={currentScreen}
                rows={(currentScreen === "Second pass judging"
                  ? view.shortlist || []
                  : view.projects
                ).map((project) => ({ project }))}
                caption="Project showcase · scores are private"
              />
            )}
            <div className="s-personal-progress">
              <strong>{view.reviews.length}</strong>
              <span>reviews from you</span>
            </div>
          </div>
        </div>
        <div className="s-judge-navigation">
          <nav className="s-tabs" aria-label="Judging stages">
            {[
              "First pass judging",
              "Top finalists",
              "Second pass judging",
              "Winners",
            ].map((item) => (
              <button
                key={item}
                className={currentScreen === item ? "s-tab-active" : ""}
                aria-current={currentScreen === item ? "page" : undefined}
                onClick={() => selectScreen(item)}
              >
                {item === "Top finalists"
                  ? `Top ${e.rules.finalistCount}`
                  : item}
              </button>
            ))}
          </nav>
          {(view.reviews.length > 0 || view.results.length > 0) && (
            <details className="s-judge-history-menu">
              <summary className="s-button">Your reviews</summary>
              <div>
                {" "}
                {view.reviews.length > 0 && (
                  <details className="s-history" name="judge-history">
                    <summary>
                      Your submitted reviews · {view.reviews.length}
                    </summary>
                    <div className="s-table-wrap">
                      <table className="s-table">
                        <thead>
                          <tr>
                            <th>Project</th>
                            <th>Round</th>
                            <th>Your scores</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {view.reviews.map((r) => (
                            <tr key={r.id}>
                              <td>
                                {
                                  view.projects.find(
                                    (p) => p.id === r.projectId,
                                  )?.name
                                }
                              </td>
                              <td>{r.round}</td>
                              <td>
                                {e.rules.criteria
                                  .map((c) => `${c.name}: ${r.scores[c.id]}`)
                                  .join(" · ")}
                              </td>
                              <td>{r.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
                {view.results.length > 0 && (
                  <details className="s-history" name="judge-history">
                    <summary>
                      Shared aggregate scores · {view.results.length} projects
                    </summary>
                    {view.results.map((r) => (
                      <div className="s-score-line" key={r.project.id}>
                        <span>{r.project.name}</span>
                        <strong>{r.score.toFixed(2)}</strong>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            </details>
          )}
        </div>
        <ErrorMessage message={error} />
        <div className="s-judge-body">
          {currentScreen === "Top finalists" || currentScreen === "Winners" ? (
            <JudgePhaseGallery view={view} section={currentScreen} />
          ) : currentScreen === "First pass judging" &&
            ["final", "published", "archived"].includes(e.stage) ? (
            <Empty
              title="First pass complete"
              detail="Your submitted reviews are available in Your reviews."
            >
              <button onClick={() => selectScreen("Second pass judging")}>
                Second pass judging →
              </button>
            </Empty>
          ) : currentScreen === "Second pass judging" &&
            !["final", "published", "archived"].includes(e.stage) ? (
            <Empty
              title="Second pass has not started"
              detail={`Your organizer will confirm the Top ${e.rules.finalistCount} and judging panel at the end of first-pass judging.`}
            >
              <button onClick={() => selectScreen("Top finalists")}>
                View Top {e.rules.finalistCount} →
              </button>
            </Empty>
          ) : currentScreen === "Second pass judging" &&
            e.finalJudgeIds &&
            !e.finalJudgeIds.includes(view.actor.judgeId || "") ? (
            <Empty
              title="Your second-pass panel"
              detail="You are not on the selected second-pass roster. You can view the finalists and live winners."
            />
          ) : ["published", "archived"].includes(e.stage) ? (
            <Empty
              title="That’s a wrap."
              detail="Thank you for lending your perspective. Every review helped."
            >
              {e.rules.publicGallery && (
                <Link className="s-button s-inverse" href={`/showcase/${slug}`}>
                  See the celebration ↗
                </Link>
              )}
            </Empty>
          ) : e.stage === "ready" ? (
            <Empty
              title="The room is almost ready."
              detail="Your organizer will open judging shortly. This page updates automatically."
            />
          ) : e.stage === "final" && e.rules.template === "ranked-final" ? (
            <BallotForm view={view} refresh={() => load(info.id)} />
          ) : (
            <ReviewDesk
              key={`${e.id}:${e.stage}:${view.actor.judgeId}`}
              view={view}
              refresh={() => load(info.id)}
            />
          )}
        </div>
      </main>
    </Frame>
  );
}
function ReviewDesk({
  view,
  refresh,
}: {
  view: EventView;
  refresh: () => Promise<void>;
}) {
  const [project, setProject] = useState<Project | null>(null),
    [scores, setScores] = useState<Record<string, number>>({}),
    [notes, setNotes] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [skipped, setSkipped] = useState<string[]>([]),
    [generation, setGeneration] = useState(0);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve()),
    initializing = useRef(true),
    e = view.event;
  const key = project
    ? `hackbuddy-draft:${e.id}:${e.stage}:${view.actor.judgeId}:${project.id}`
    : "";
  useEffect(() => {
    let alive = true;
    initializing.current = true;
    judgeApi<Claim>(`events/${e.id}`, { action: "claim", skip: skipped })
      .then((v) => {
        if (!alive) return;
        setProject(v.project);
        let draft = v.draft;
        if (v.project) {
          try {
            const local = JSON.parse(
              localStorage.getItem(
                `hackbuddy-draft:${e.id}:${e.stage}:${view.actor.judgeId}:${v.project.id}`,
              ) || "null",
            ) as Draft | null;
            if (local && (!draft || local.updatedAt > draft.updatedAt))
              draft = local;
          } catch {}
        }
        setScores(draft?.scores || {});
        setNotes(draft?.notes || "");
        setStatus(draft ? "Saved draft restored" : "");
        setLoaded(true);
        initializing.current = false;
      })
      .catch((err) => {
        if (alive) {
          setError(err.message);
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [e.id, e.stage, view.actor.judgeId, generation, skipped]);
  useEffect(() => {
    if (!project || initializing.current || busy) return;
    const draft = { scores, notes, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {}
    const timer = setTimeout(() => {
      saveChain.current = saveChain.current
        .catch(() => {})
        .then(() =>
          judgeApi(`events/${e.id}`, {
            action: "draft",
            projectId: project.id,
            scores,
            notes,
          }),
        )
        .then(() => setStatus("Draft saved"))
        .catch((err) => {
          setStatus("Saved on this device. Reconnect to sync.");
          setError(err.message);
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [scores, notes, project, key, e.id, busy]);
  useEffect(() => {
    if (!project) return;
    const timer = setInterval(() => {
      if (!document.hidden)
        judgeApi(`events/${e.id}`, {
          action: "heartbeat",
          projectId: project.id,
        }).catch((err) => setError(err.message));
    }, 60000);
    return () => clearInterval(timer);
  }, [project, e.id]);
  async function submit() {
    if (!project) return;
    if (e.rules.criteria.some((c) => scores[c.id] === undefined)) {
      setError("Choose a score for every criterion.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveChain.current;
      await judgeApi(`events/${e.id}`, {
        action: "submit",
        projectId: project.id,
        scores,
        notes,
      });
      try {
        localStorage.removeItem(key);
      } catch {}
      setProject(null);
      await refresh();
      setGeneration((v) => v + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function skip() {
    if (!project) return;
    setBusy(true);
    setError("");
    try {
      await saveChain.current;
      await judgeApi(`events/${e.id}`, {
        action: "draft",
        projectId: project.id,
        scores,
        notes,
      });
      await judgeApi(`events/${e.id}`, {
        action: "skip",
        projectId: project.id,
      });
      setProject(null);
      setSkipped((v) => [...v, project.id]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!loaded) return <div className="s-note">Finding a project for you…</div>;
  if (!project)
    return (
      <>
        <ErrorMessage message={error} />
        <Empty
          title="A good moment to pause."
          detail="No unreserved, eligible projects need another review from you. Other judges may be reviewing, or your assigned track may be complete."
        >
          <button
            onClick={() => {
              setError("");
              setSkipped([]);
              setGeneration((v) => v + 1);
            }}
          >
            Check the queue again ↻
          </button>
        </Empty>
      </>
    );
  return (
    <div className="s-review-grid">
      <article className="s-project-detail">
        <div className="s-card-top">
          <ProjectIcon name={project.name} image={project.image} />
          {project.track && <span className="s-tag">{project.track}</span>}
        </div>
        <h2>{project.name}</h2>
        <p className="s-lead">
          {project.description ||
            "The team will tell you more about their project."}
        </p>
        <div className="s-detail-meta">
          <span className="s-eyebrow">Built by</span>
          <p>{project.team || "Team details to come"}</p>
        </div>
        {project.tools && (
          <div className="s-detail-meta">
            <span className="s-eyebrow">Made with</span>
            <p>{project.tools}</p>
          </div>
        )}
        <div className="s-actions">
          {project.demo && (
            <a
              className="s-button"
              href={project.demo}
              target="_blank"
              rel="noreferrer"
            >
              See the demo ↗
            </a>
          )}
          {project.repository && (
            <a
              className="s-button"
              href={project.repository}
              target="_blank"
              rel="noreferrer"
            >
              View source ↗
            </a>
          )}
        </div>
      </article>
      <form
        className="s-review-form s-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <div className="s-section-heading">
          <div>
            <h2>Score this project</h2>
          </div>
          <span className="s-caption" role="status">
            {status}
          </span>
        </div>
        <ErrorMessage message={error} />
        {e.rules.criteria.map((c) => (
          <div className="s-score-control" key={c.id}>
            <div className="s-section-heading">
              <label htmlFor={`score-${c.id}`}>{c.name}</label>
              <span className="s-muted">{c.weight}× weight</span>
            </div>
            {c.guidance && (
              <details className="s-criterion-guide" name="criterion-guide">
                <summary>Scoring guide</summary>
                <p>{c.guidance}</p>
              </details>
            )}
            {c.max - c.min <= 9 ? (
              <div className="s-number-scores" role="group" aria-label={c.name}>
                {Array.from(
                  { length: c.max - c.min + 1 },
                  (_, i) => c.min + i,
                ).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${c.name}: ${value} out of ${c.max}`}
                    aria-pressed={scores[c.id] === value}
                    className={scores[c.id] === value ? "s-selected" : ""}
                    onClick={() =>
                      setScores((values) => ({ ...values, [c.id]: value }))
                    }
                  >
                    {value}
                  </button>
                ))}
              </div>
            ) : (
              <select
                id={`score-${c.id}`}
                required
                value={scores[c.id] ?? ""}
                onChange={(ev) =>
                  setScores((v) => {
                    const next = { ...v };
                    if (!ev.target.value) delete next[c.id];
                    else next[c.id] = +ev.target.value;
                    return next;
                  })
                }
              >
                <option value="">
                  Choose a score · {c.min}–{c.max}
                </option>
                {Array.from(
                  { length: c.max - c.min + 1 },
                  (_, i) => i + c.min,
                ).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
        <details className="s-review-notes">
          <summary>Private notes{notes ? " · added" : " (optional)"}</summary>
          <Field
            label="Private notes"
            hint="For your review record and the organizer. Not shown in the public gallery."
          >
            <textarea
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              placeholder="What stood out? What could go further?"
              maxLength={10000}
            />
          </Field>
        </details>
        <div className="s-actions">
          <button className="s-inverse" disabled={busy}>
            {busy ? "Saving…" : "Submit & next project →"}
          </button>
          <button type="button" disabled={busy} onClick={skip}>
            Save & skip for now
          </button>
        </div>
        <p className="s-caption">
          Your draft saves automatically. Organizers can correct submitted
          scores.
        </p>
      </form>
    </div>
  );
}
function BallotForm({
  view,
  refresh,
}: {
  view: EventView;
  refresh: () => Promise<void>;
}) {
  const existing = view.ballots[0],
    [picks, setPicks] = useState<string[]>(existing?.picks || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(!!existing);
  const own = view.judges[0];
  const all = view.projects.filter((p) => view.event.finalists.includes(p.id)),
    ps = all.filter(
      (p) =>
        !own?.conflicts.includes(p.id) &&
        (!own?.tracks.length || own.tracks.includes(p.track)),
    );
  const count = Math.min(view.event.rules.winnerCount, all.length);
  return (
    <div className="s-ballot-layout">
      <section>
        <div className="s-section-heading">
          <h2>The finalists.</h2>
          <span className="s-tag">Alphabetical · unranked</span>
        </div>
        <div className="s-project-grid">
          {all
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <article className="s-project-card" key={p.id}>
                <ProjectIcon name={p.name} image={p.image} />
                <h3>{p.name}</h3>
                <small>{p.team}</small>
                <details name="ballot-project">
                  <summary>Project details</summary>
                  <p>Built by {p.team || "an independent team"}</p>
                  <p>{p.description}</p>
                  {p.demo && (
                    <a href={p.demo} target="_blank" rel="noreferrer">
                      Demo ↗
                    </a>
                  )}
                </details>
              </article>
            ))}
        </div>
      </section>
      <form
        className="s-panel s-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          setBusy(true);
          setError("");
          judgeApi(`events/${view.event.id}`, { action: "ballot", picks })
            .then(async () => {
              setSaved(true);
              await refresh();
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <h2>Rank your favorites</h2>
        <details className="s-ballot-help">
          <summary>Choose {count} different projects</summary>
          <p>You can update your ballot until the organizer publishes.</p>
        </details>
        <ErrorMessage message={error} />
        {ps.length < count && (
          <div className="s-note">
            Your track or conflict settings leave too few eligible finalists.
            Ask the organizer to review your assignments.
          </div>
        )}
        {Array.from({ length: count }, (_, i) => (
          <Field
            key={i}
            label={`Choice ${i + 1} · ${view.event.rules.points[i]} ${view.event.rules.points[i] === 1 ? "point" : "points"}`}
          >
            <select
              value={picks[i] || ""}
              required
              onChange={(e) => {
                setSaved(false);
                setPicks((v) =>
                  Array.from({ length: count }, (_, j) =>
                    i === j ? e.target.value : v[j] || "",
                  ),
                );
              }}
            >
              <option value="">Choose a finalist</option>
              {ps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ))}
        <button
          className="s-inverse"
          aria-live="polite"
          disabled={busy || ps.length < count}
        >
          {busy
            ? "Saving…"
            : saved
              ? "Ballot saved ✓"
              : "Submit final ballot ↗"}
        </button>
        <Progress value={picks.filter(Boolean).length} max={count} />
      </form>
    </div>
  );
}
