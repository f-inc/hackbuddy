"use client";
import type { EventView } from "@/domain/studio/model";
import { formats, Progress, ProjectIcon } from "./shared";

export function EventOverview({
  view,
  select,
}: {
  view: EventView;
  select: (tab: string) => void;
}) {
  const e = view.event,
    editable = ["draft", "ready"].includes(e.stage);
  const voters = e.finalists.length > 0 && e.rules.template === "ranked-final";
  const ready = view.readiness.filter((item) => item.ok).length;
  const setup = [
    {
      name: "Projects",
      detail: `${view.projects.length} submissions imported`,
      tab: "Projects",
    },
    {
      name: "Judging rubric",
      detail: `${e.rules.criteria.length} criteria · ${e.rules.reviews} ${e.rules.reviews === 1 ? "review" : "reviews"} per project`,
      tab: "Settings",
    },
    {
      name: "Judge access",
      detail: e.passwordSet ? "Event password set" : "Set a judge password",
      tab: "Settings",
    },
    {
      name: "Review coverage",
      detail: `${view.judges.filter((j) => j.active).length} active judges${e.rules.guests ? " · open invitations" : " · roster only"}`,
      tab: "Judges",
    },
  ];
  return (
    <div className="s-overview-compact">
      <div className="s-workspace-metrics" aria-label="Hackathon counts">
        <button onClick={() => select("Projects")}>
          <strong>{view.stats.projects}</strong>
          <span>projects</span>
        </button>
        <button onClick={() => select("Judges")}>
          <strong>{view.judges.filter((j) => j.active).length}</strong>
          <span>judges</span>
        </button>
        <button onClick={() => select("Results")}>
          <strong>{view.stats.reviews}</strong>
          <span>reviews</span>
        </button>
        <button onClick={() => select("Results")}>
          <strong>
            {view.stats.complete}/{view.stats.required}
          </strong>
          <span>{voters ? "ballots in" : "projects reviewed"}</span>
        </button>
      </div>
      <div className="s-overview-panels">
        <section className="s-compact-panel">
          <div className="s-compact-panel-heading">
            <h2>
              {editable
                ? "Setup checklist"
                : view.publication
                  ? "Official winners"
                  : "Judging progress"}
            </h2>
            <span className="s-caption">
              {editable
                ? `${ready}/${view.readiness.length} ready`
                : view.publication
                  ? `Revision ${view.publication.revision}`
                  : e.stage === "final"
                    ? "Final round"
                    : "Preliminary"}
            </span>
          </div>
          <div className="s-compact-panel-body">
            {editable ? (
              <div className="s-setup-list">
                {setup.map((item, i) => (
                  <button key={item.name} onClick={() => select(item.tab)}>
                    <span
                      className={
                        view.readiness[i]?.ok
                          ? "s-check s-check-done"
                          : "s-check"
                      }
                    >
                      {view.readiness[i]?.ok ? "✓" : i + 1}
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.detail}</small>
                      {!view.readiness[i]?.ok && i === 3 && (
                        <small>{view.readiness[i].label}</small>
                      )}
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            ) : view.publication ? (
              <div className="s-official-winner-list">
                {view.publication.winners.map((r, i) => (
                  <div key={r.project.id}>
                    <span className="s-check">{i + 1}</span>
                    <div>
                      <strong>{r.project.name}</strong>
                      <small>{r.project.team}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <Progress
                  value={view.stats.complete}
                  max={view.stats.required}
                />
                <p className="s-compact-description">
                  {view.stats.complete} of {view.stats.required}{" "}
                  {voters
                    ? "eligible judges have submitted a ballot."
                    : "projects have complete review coverage."}
                </p>
                <div className="s-compact-judge-list">
                  {view.judges
                    .filter((j) => j.active)
                    .map((j) => (
                      <div key={j.id}>
                        <span>{j.name}</span>
                        <small>
                          {
                            view.reviews.filter((r) => r.judgeId === j.id)
                              .length
                          }{" "}
                          reviews
                        </small>
                      </div>
                    ))}
                </div>
              </>
            )}
            <details className="s-compact-detail">
              <summary>Judging format</summary>
              <div>
                <p>
                  {formats[e.rules.template]} · {e.rules.reviews} reviews per
                  project
                  {e.rules.template !== "single" &&
                    ` · ${e.rules.finalistCount} finalists`}{" "}
                  · {e.rules.winnerCount} winners.
                </p>
                <p>
                  {e.rules.criteria
                    .map((c) => `${c.name} (${c.min}–${c.max})`)
                    .join(" · ")}
                </p>
                <button onClick={() => select("Settings")}>
                  View settings →
                </button>
              </div>
            </details>
          </div>
        </section>
        <section className="s-compact-panel">
          <div className="s-compact-panel-heading">
            <h2>
              Projects <span className="s-muted">{view.projects.length}</span>
            </h2>
            <button onClick={() => select("Projects")}>Manage →</button>
          </div>
          <div className="s-compact-panel-body s-compact-projects">
            {view.projects.length ? (
              view.projects.map((p) => (
                <details
                  className="s-workspace-project"
                  key={p.id}
                  name="overview-project"
                >
                  <summary>
                    <ProjectIcon name={p.name} image={p.image} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.team || "Team details to come"}</small>
                    </span>
                    <span className="s-project-track">{p.track}</span>
                    <span className="s-disclosure-arrow" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <div>
                    <p>{p.description || "No description added."}</p>
                    {p.tools && <p>Built with {p.tools}</p>}
                    <div className="s-actions">
                      {p.demo && (
                        <a href={p.demo} target="_blank" rel="noreferrer">
                          Demo ↗
                        </a>
                      )}
                      {p.repository && (
                        <a href={p.repository} target="_blank" rel="noreferrer">
                          Source ↗
                        </a>
                      )}
                    </div>
                  </div>
                </details>
              ))
            ) : (
              <div className="s-compact-empty">
                <p>Import team submissions to start setting up judging.</p>
                <button onClick={() => select("Projects")}>
                  Add projects →
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
