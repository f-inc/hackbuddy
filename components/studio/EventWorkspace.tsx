"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EventView } from "@/domain/studio/model";
import {
  api,
  Empty,
  ErrorMessage,
  formats,
  Frame,
  Progress,
  ProjectIcon,
} from "./shared";
import { EventSettings } from "./EventSettings";
import { ProjectImport } from "./ProjectImport";
import { JudgeRoster } from "./JudgeRoster";
import { EventResults } from "./EventResults";
export type RunAction = (data: Record<string, unknown>) => Promise<void>;
const tabs = [
  "Overview",
  "Projects",
  "Judges",
  "Settings",
  "Results",
  "Activity",
];
export function EventWorkspace({ id }: { id: string }) {
  const router = useRouter(),
    [view, setView] = useState<EventView | null>(null),
    [tab, setTab] = useState("Overview"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const v = await api<EventView>(`events/${id}`);
    if (v.actor.role !== "organizer")
      throw new Error("Open your organizer workspace to manage this event.");
    setView(v);
  }, [id]);
  useEffect(() => {
    let alive = true;
    api<EventView>(`events/${id}`)
      .then((v) => {
        if (!alive) return;
        if (v.actor.role !== "organizer")
          throw new Error("Organizer access required.");
        setView(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    const timer = setInterval(() => {
      if (!document.hidden) load().catch(() => {});
    }, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, load]);
  const run: RunAction = async (data) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const v = await api<EventView>(`events/${id}`, data);
      if (data.action === "duplicate") {
        router.push(`/studio/${v.event.id}`);
        return;
      }
      await load();
      setNotice("Saved.");
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const fire = (data: Record<string, unknown>) => {
    run(data).catch(() => {});
  };
  if (!view)
    return (
      <Frame>
        <main className="s-container">
          <ErrorMessage message={error} />
          {!error ? (
            <p>Opening your event…</p>
          ) : (
            <Link href="/studio">Go to workspace ↗</Link>
          )}
        </main>
      </Frame>
    );
  const e = view.event,
    editable = ["draft", "ready"].includes(e.stage);
  return (
    <Frame
      label={e.name}
      actions={
        <>
          <Link
            className="s-button"
            href={`/showcase/${e.slug}`}
            target="_blank"
          >
            View showcase ↗
          </Link>
          <Link href="/studio">Your workspace</Link>
        </>
      }
    >
      <main className="s-container">
        <div className="s-breadcrumb">
          <Link href="/studio">Your events</Link>
          <span>/</span>
          {e.name}
        </div>
        <div className="s-page-heading">
          <div>
            <div className="s-actions">
              <span className={`s-tag s-stage-${e.stage}`}>{e.stage}</span>
              <span className="s-muted">{formats[e.rules.template]}</span>
            </div>
            <h1>{e.name}</h1>
            <p>{e.description || "A new space for good ideas."}</p>
          </div>
          <div className="s-actions">
            <button
              onClick={() => fire({ action: "duplicate" })}
              disabled={busy}
            >
              Duplicate settings ↗
            </button>
            {e.stage === "draft" && (
              <button
                className="s-inverse"
                onClick={() => fire({ action: "ready" })}
                disabled={busy}
              >
                Mark ready →
              </button>
            )}
            {e.stage === "ready" && (
              <button
                className="s-inverse"
                onClick={() => fire({ action: "start" })}
                disabled={busy}
              >
                Open judging ↗
              </button>
            )}
            {e.stage === "published" && (
              <button
                onClick={() => fire({ action: "archive" })}
                disabled={busy}
              >
                Archive event
              </button>
            )}
          </div>
        </div>
        {view.actor.demo && (
          <div className="s-note">
            Sample workspace · Make yourself at home. The sample judge password
            is <strong>judges</strong>. Your changes do not affect other events.
          </div>
        )}
        <div className="s-tabs" role="tablist" aria-label="Event sections">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "s-tab-active" : ""}
              onClick={() => {
                setTab(t);
                setError("");
                setNotice("");
              }}
            >
              {t}
              {t === "Projects" && <span>{view.projects.length}</span>}
            </button>
          ))}
        </div>
        <ErrorMessage message={error} />
        {notice && (
          <div className="s-saved" role="status">
            {notice}
          </div>
        )}
        {tab === "Overview" && (
          <>
            <div className="s-stats">
              <article>
                <span>Projects</span>
                <strong>{view.stats.projects}</strong>
                <small>Ideas ready for their moment</small>
              </article>
              <article>
                <span>Judges</span>
                <strong>{view.judges.filter((j) => j.active).length}</strong>
                <small>Active in your event</small>
              </article>
              <article>
                <span>Submitted reviews</span>
                <strong>{view.stats.reviews}</strong>
                <small>{e.rules.reviews} required per project</small>
              </article>
              <article>
                <span>
                  {e.stage === "final" && e.rules.template === "ranked-final"
                    ? "Final ballots"
                    : "Review coverage"}
                </span>
                <strong>
                  {e.stage === "final" && e.rules.template === "ranked-final"
                    ? view.stats.ballots
                    : `${view.stats.complete}/${view.stats.required}`}
                </strong>
                <small>Current round</small>
              </article>
            </div>
            <div className="s-overview-grid">
              <section className="s-panel">
                <div className="s-section-heading">
                  <h2>{editable ? "Set the stage." : "Keep it moving."}</h2>
                  <span>✳</span>
                </div>
                <p>
                  {editable
                    ? "A few thoughtful details before the first review."
                    : e.stage === "archived"
                      ? "A permanent home for what you built together."
                      : "Your event at a glance. Every review moves it forward."}
                </p>
                {editable ? (
                  <div className="s-checklist">
                    {view.readiness.map((v, i) => (
                      <button
                        key={v.label}
                        onClick={() =>
                          setTab(
                            ["Projects", "Settings", "Settings", "Judges"][i],
                          )
                        }
                      >
                        <span
                          className={v.ok ? "s-check s-check-done" : "s-check"}
                        >
                          {v.ok ? "✓" : i + 1}
                        </span>
                        <span>{v.label}</span>
                        <span>↗</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <Progress
                      value={view.stats.complete}
                      max={view.stats.required}
                    />
                    <p>
                      {view.stats.complete} of {view.stats.required}{" "}
                      {e.finalists.length > 0 &&
                      e.rules.template === "ranked-final"
                        ? "eligible judges have submitted ballots."
                        : "projects have complete review coverage."}
                    </p>
                    <button onClick={() => setTab("Results")}>
                      Open round controls →
                    </button>
                  </>
                )}
                <div className="s-panel-foot">
                  {editable
                    ? "Your judging rules freeze when you open judging."
                    : "Assignments expire automatically. Drafts stay saved."}
                </div>
              </section>
              <section className="s-panel s-panel-white">
                <span className="s-eyebrow">A simple invitation</span>
                <h2>
                  Good judgment.
                  <br />
                  Less friction.
                </h2>
                <p>
                  Judges sign in with their name and your event password. Share
                  this link and send the password separately.
                </p>
                <div className="s-link-box">/events/{e.slug}</div>
                <div className="s-actions">
                  <button
                    onClick={() => {
                      navigator.clipboard
                        .writeText(`${location.origin}/events/${e.slug}`)
                        .then(() => setNotice("Judge link copied."))
                        .catch(() => setError("Copy the link shown above."));
                    }}
                  >
                    Copy judge link ↗
                  </button>
                  <Link href={`/events/${e.slug}`} target="_blank">
                    Open judge view ↗
                  </Link>
                </div>
              </section>
            </div>
            <section className="s-section">
              <div className="s-section-heading">
                <h2>The ideas in the room.</h2>
                <button onClick={() => setTab("Projects")}>
                  All projects ↗
                </button>
              </div>
              {view.projects.length ? (
                <div className="s-project-grid">
                  {view.projects.slice(0, 4).map((p) => (
                    <article className="s-project-card" key={p.id}>
                      <div className="s-card-top">
                        <ProjectIcon name={p.name} image={p.image} />
                        {p.track && <span className="s-tag">{p.track}</span>}
                      </div>
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <small>{p.team || "Team details to come"}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Make room for your projects."
                  detail="Import a CSV or connect your Airtable to get started."
                >
                  <button onClick={() => setTab("Projects")}>
                    Bring in your projects ↗
                  </button>
                </Empty>
              )}
            </section>
          </>
        )}
        {tab === "Projects" && (
          <ProjectImport view={view} run={run} busy={busy} />
        )}
        {tab === "Judges" && <JudgeRoster view={view} run={run} busy={busy} />}
        {tab === "Settings" && (
          <EventSettings view={view} run={run} busy={busy} />
        )}
        {tab === "Results" && (
          <EventResults view={view} run={run} busy={busy} />
        )}
        {tab === "Activity" && (
          <section>
            <div className="s-section-heading">
              <div>
                <h2>Every step, recorded.</h2>
                <p>
                  Invitations, round changes, reviews, and publication
                  revisions.
                </p>
              </div>
              <a
                className="s-button"
                href={`/api/studio/events/${id}/export?kind=audit`}
              >
                Export activity ↓
              </a>
            </div>
            <div className="s-table-wrap">
              <table className="s-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Who</th>
                    <th>When</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {view.audit.map((a) => (
                    <tr key={a.id}>
                      <td>{a.action}</td>
                      <td>{a.actor}</td>
                      <td>{new Date(a.at).toLocaleString()}</td>
                      <td className="s-muted">{a.detail || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </Frame>
  );
}
