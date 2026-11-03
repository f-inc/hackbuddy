"use client";
import { useEffect, useState } from "react";
import type { EventView, Project } from "@/domain/studio/model";
import type { RunAction } from "./EventWorkspace";
import { Empty, ErrorMessage, Field, Progress, ProjectIcon } from "./shared";
import { type PresentationRow, FlowPresentation } from "./FlowPresentation";
import { SubmissionEditor } from "./SubmissionEditor";
export type FlowSection =
  | "First pass judging"
  | "Top finalists"
  | "Second pass judging"
  | "Winners";
type Decision =
  | "shortlist"
  | "start"
  | "publish"
  | "revise"
  | "reset"
  | "ballot"
  | "roster";
export function EventFlow({
  view,
  section,
  run,
  busy,
  select,
}: {
  view: EventView;
  section: FlowSection;
  run: RunAction;
  busy: boolean;
  select: (tab: string) => void;
}) {
  const e = view.event,
    first = section === "First pass judging",
    top = section === "Top finalists",
    second = section === "Second pass judging",
    winners = section === "Winners";
  const [pageSize, setPageSize] = useState(4);
  useEffect(() => {
    const compact = window.matchMedia(
      "(min-width: 901px) and (max-height: 639px)",
    );
    const resize = () => setPageSize(compact.matches ? 3 : 4);
    resize();
    compact.addEventListener("change", resize);
    return () => compact.removeEventListener("change", resize);
  }, []);
  const [page, setPage] = useState(0),
    [editor, setEditor] = useState<Project | null>(null),
    [editorTab, setEditorTab] = useState<"Project" | "Scores">("Scores"),
    [decision, setDecision] = useState<Decision | null>(null),
    [chosen, setChosen] = useState<string[]>([]),
    [roster, setRoster] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [ballotJudge, setBallotJudge] = useState("");
  const qualified = view.preliminary.filter(
      (r) => r.reviews >= e.rules.reviews,
    ),
    shortlist = view.shortlist || [],
    result = view.publication?.winners || view.liveWinners || [],
    title = top ? `Top ${e.rules.finalistCount}` : section;
  const started = ["final", "published", "archived"].includes(e.stage),
    activeJudges = view.judges.filter((j) => j.active),
    panel = activeJudges.filter(
      (j) => !e.finalJudgeIds || e.finalJudgeIds.includes(j.id),
    );
  const minimum = Math.min(e.rules.winnerCount, view.projects.length),
    canStart =
      e.stage === "judging" &&
      e.rules.template !== "single" &&
      qualified.length >= minimum &&
      qualified.length > 0;
  const ranked = first ? view.preliminary : view.results,
    pages = Math.max(
      1,
      Math.ceil((first ? ranked.length : panel.length) / pageSize),
    ),
    current = Math.min(page, pages - 1);
  function open(kind: Decision, judgeId?: string) {
    setError("");
    setReason("");
    setDecision(kind);
    setChosen(
      kind === "ballot"
        ? view.ballots.find((b) => b.judgeId === judgeId)?.picks || []
        : kind === "shortlist" || kind === "start"
          ? shortlist.map((p) => p.id)
          : result.map((r) => r.project.id),
    );
    setRoster(e.finalJudgeIds || activeJudges.map((j) => j.id));
    setBallotJudge(judgeId || "");
  }
  const selectionPool =
    decision === "shortlist" || decision === "start"
      ? qualified.map((r) => r.project)
      : decision === "ballot"
        ? shortlist
        : view.results.map((r) => r.project);
  const selectionCount = Math.min(
    decision === "shortlist" || decision === "start"
      ? e.rules.finalistCount
      : e.rules.winnerCount,
    selectionPool.length,
  );
  const automaticPublication =
    decision === "publish" &&
    !result.some((r) => r.tied) &&
    chosen.length === result.length &&
    chosen.every((id, i) => id === result[i].project.id);
  async function submitDecision() {
    setError("");
    try {
      const action =
        decision === "shortlist"
          ? "select-finalists"
          : decision === "start"
            ? "start-final"
            : decision === "reset"
              ? "reset-final"
              : decision === "roster"
                ? "final-roster"
                : decision === "ballot"
                  ? "edit-ballot"
                  : decision;
      await run({
        action,
        finalistIds: chosen,
        winnerIds: automaticPublication ? undefined : chosen,
        judgeIds: roster,
        judgeId: ballotJudge,
        picks: chosen,
        reason:
          reason ||
          (decision === "start"
            ? `Confirmed Top ${selectionCount} and second-pass judge roster`
            : ""),
      });
      setDecision(null);
      if (decision === "start") select("Second pass judging");
      if (decision === "publish" || decision === "revise") select("Winners");
      if (decision === "reset") select("Top finalists");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  const presentationRows = top
    ? shortlist.map((project) => ({ project }))
    : winners
      ? result.map((r, i) => ({
          project: r.project,
          place: i + 1,
          score: r.score,
        }))
      : ranked.map((r) => ({ project: r.project, score: r.score }));
  return (
    <section className="s-event-flow">
      <div className="s-section-heading">
        <div>
          <h2>{title}</h2>
          <p>
            {first
              ? `${qualified.length}/${view.projects.length} projects reviewed · ${e.rules.reviews} reviews per project`
              : top
                ? `${shortlist.length} finalists · alphabetical, no ranking implied${started ? " · confirmed" : " · provisional"}`
                : second
                  ? started
                    ? e.rules.template === "ranked-final"
                      ? `${view.ballots.length}/${view.stats.required} ballots submitted`
                      : `${view.stats.complete}/${view.stats.required} finalists scored`
                    : "Confirm the finalists and judging panel before opening the second pass."
                  : view.publication
                    ? `Published · revision ${view.publication.revision}`
                    : "Live standings · provisional until published"}
          </p>
        </div>
        <div className="s-actions">
          <FlowPresentation
            eventName={e.name}
            title={title}
            rows={presentationRows}
            winners={winners}
            caption={
              top
                ? "Alphabetical · no ranking or first-pass scores shown"
                : view.publication && winners
                  ? `Official results · revision ${view.publication.revision}`
                  : "Live · updates as judges submit or edit"
            }
          />
          {first && e.stage === "judging" && (
            <a
              className="s-button"
              href={`/events/${e.slug}?view=first-pass`}
              target="_blank"
              rel="noreferrer"
            >
              Open judging desk ↗
            </a>
          )}
          {first && ["draft", "ready"].includes(e.stage) && (
            <button
              className="s-inverse"
              disabled={busy || !view.readiness.every((r) => r.ok)}
              onClick={async () => {
                try {
                  if (e.stage === "draft") await run({ action: "ready" });
                  await run({ action: "start" });
                } catch {}
              }}
            >
              Open first pass →
            </button>
          )}
          {(top || second) && !started && (
            <button
              className="s-inverse"
              disabled={busy || !canStart}
              onClick={() => open("start")}
            >
              Confirm & start second pass →
            </button>
          )}
          {top && e.stage === "judging" && shortlist.length > 0 && (
            <button onClick={() => open("shortlist")}>
              Edit Top {e.rules.finalistCount}
            </button>
          )}
          {winners &&
            (e.stage === "final" ||
              (e.stage === "judging" && e.rules.template === "single")) &&
            result.length > 0 && (
              <details className="s-result-decisions">
                <summary className="s-button">Result controls</summary>
                <button className="s-inverse" onClick={() => open("publish")}>
                  Archive & lock winners
                </button>
              </details>
            )}
          {winners && view.publication && (
            <button onClick={() => open("revise")}>Edit winners</button>
          )}
        </div>
      </div>
      {first && (
        <>
          <Progress value={qualified.length} max={view.projects.length} />
          <div className="s-table-wrap">
            <table className="s-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Team</th>
                  <th>Reviews</th>
                  <th>Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ranked
                  .slice(current * pageSize, (current + 1) * pageSize)
                  .map((r) => (
                    <tr key={r.project.id}>
                      <td>
                        <strong>{r.project.name}</strong>
                      </td>
                      <td>{r.project.team}</td>
                      <td>
                        {r.reviews}/{e.rules.reviews}
                      </td>
                      <td>
                        {r.reviews ? r.score.toFixed(2) : "Awaiting scores"}
                      </td>
                      <td>
                        <button
                          onClick={() => {
                            setEditor(r.project);
                            setEditorTab("Scores");
                          }}
                        >
                          Inspect / edit
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination page={current} pages={pages} change={setPage} />
          {!ranked.length && (
            <Empty
              title="Add your project submissions"
              detail="Import projects, then open first-pass judging."
            >
              <button onClick={() => select("Projects")}>
                Manage projects →
              </button>
            </Empty>
          )}
          <p className="s-caption">
            {e.rules.scoring === "normalized"
              ? "Judge-normalized scores."
              : "Weighted rubric scores, scaled to 100."}{" "}
            Scores and notes can be corrected from Inspect / edit.
          </p>
        </>
      )}
      {top &&
        (e.rules.template === "single" ? (
          <Empty
            title="One-pass format selected"
            detail="This existing event goes directly from first-pass scores to winners. Use Settings to configure the two-pass HackBuddy flow before opening the second pass."
          >
            <button onClick={() => select("Settings")}>Settings →</button>
          </Empty>
        ) : shortlist.length ? (
          <div className="s-phase-project-list">
            {shortlist.map((p) => (
              <article key={p.id}>
                <ProjectIcon name={p.name} image={p.image} />
                <div>
                  <strong>{p.name}</strong>
                  <span>{p.team}</span>
                </div>
                <details name="shortlist-details">
                  <summary>Details</summary>
                  <p>{p.description}</p>
                  {p.demo && (
                    <a href={p.demo} target="_blank" rel="noreferrer">
                      Demo ↗
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setEditor(p);
                      setEditorTab("Project");
                    }}
                  >
                    Edit submission
                  </button>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={`The Top ${e.rules.finalistCount} is taking shape`}
            detail="Projects appear here once their first-pass reviews are complete."
          >
            <button onClick={() => select("First pass judging")}>
              First pass judging →
            </button>
          </Empty>
        ))}
      {second &&
        (e.rules.template === "single" ? (
          <Empty
            title="One-pass format selected"
            detail="This existing event does not have a second pass."
          >
            <button onClick={() => select("Winners")}>Winners →</button>
          </Empty>
        ) : !started ? (
          <Empty
            title="Second pass judging"
            detail={`Review the Top ${e.rules.finalistCount}, choose the judging roster, then start ranked voting. First-pass scores remain separate.`}
          >
            <button onClick={() => select("Top finalists")}>
              View Top {e.rules.finalistCount} →
            </button>
          </Empty>
        ) : (
          <>
            <div className="s-round-panel">
              <div>
                <h3>
                  {e.rules.template === "ranked-final"
                    ? "Ranked voting"
                    : "Second-pass scoring"}
                </h3>
                <p>
                  Judges choose their top {e.rules.winnerCount} finalists.
                  Points: {e.rules.points.join(" / ")}. Votes can be updated
                  until publication.
                </p>
              </div>
              <div className="s-actions">
                <a
                  className="s-button"
                  href={`/events/${e.slug}?view=second-pass`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open judge view ↗
                </a>
                {e.stage === "final" && (
                  <details>
                    <summary>Manage second pass</summary>
                    <button onClick={() => open("roster")}>
                      Edit judging panel
                    </button>
                    <button onClick={() => open("reset")}>
                      Reset second pass
                    </button>
                    <button onClick={() => select("Judges")}>
                      Manage judges
                    </button>
                  </details>
                )}
              </div>
            </div>
            <div className="s-table-wrap">
              <table className="s-table">
                <thead>
                  <tr>
                    <th>Judge</th>
                    <th>Status</th>
                    <th>Ballot</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {panel
                    .slice(current * pageSize, (current + 1) * pageSize)
                    .map((j) => {
                      const ballot = view.ballots.find(
                        (b) => b.judgeId === j.id,
                      );
                      return (
                        <tr key={j.id}>
                          <td>{j.name}</td>
                          <td>{ballot ? "Submitted" : "Waiting"}</td>
                          <td>
                            {ballot?.picks
                              .map(
                                (id) =>
                                  view.projects.find((p) => p.id === id)?.name,
                              )
                              .join(" → ") || "—"}
                          </td>
                          <td>
                            {e.rules.template === "ranked-final" && (
                              <button onClick={() => open("ballot", j.id)}>
                                Edit ballot
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <Pagination page={current} pages={pages} change={setPage} />
            <button onClick={() => select("Winners")}>
              View live winners →
            </button>
          </>
        ))}
      {winners &&
        (result.length ? (
          <div className="s-phase-winners">
            {result.map((r, i) => (
              <article key={r.project.id}>
                <span className="s-winner-number">{i + 1}</span>
                <ProjectIcon name={r.project.name} image={r.project.image} />
                <div>
                  <h3>{r.project.name}</h3>
                  <p>{r.project.team}</p>
                  <span>
                    {r.score.toFixed(2)}{" "}
                    {e.rules.template === "ranked-final" ? "points" : "score"}
                    {r.tied && !view.publication ? " · tied, provisional" : ""}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setEditor(r.project);
                    setEditorTab("Project");
                  }}
                >
                  Edit submission
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Waiting for second-pass votes"
            detail="The live winners appear here as judges submit ballots. Publish when the panel is done."
          >
            <button onClick={() => select("Second pass judging")}>
              Second pass judging →
            </button>
          </Empty>
        ))}
      {editor && (
        <SubmissionEditor
          project={editor}
          view={view}
          run={run}
          busy={busy}
          close={() => setEditor(null)}
          initialTab={editorTab}
        />
      )}
      {decision && (
        <div className="s-modal-backdrop">
          <form
            className="s-modal s-form"
            role="dialog"
            aria-modal="true"
            aria-label="Judging controls"
            onInvalidCapture={(ev) => {
              const section = (ev.target as HTMLElement).closest("details");
              if (section) section.open = true;
            }}
            onSubmit={(ev) => {
              ev.preventDefault();
              submitDecision();
            }}
          >
            <div className="s-section-heading">
              <h2>
                {decision === "start"
                  ? "Start second pass"
                  : decision === "reset"
                    ? "Reset second pass"
                    : decision === "shortlist"
                      ? `Edit Top ${e.rules.finalistCount}`
                      : decision === "roster"
                        ? "Edit judging panel"
                        : decision === "ballot"
                          ? "Edit final ballot"
                          : decision === "publish"
                            ? "Archive & lock winners"
                            : "Edit published winners"}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDecision(null)}
              >
                ×
              </button>
            </div>
            {decision === "reset" ? (
              <p>
                This clears second-pass ballots and scores and returns to Top{" "}
                {e.rules.finalistCount}. First-pass scores are preserved.
              </p>
            ) : decision === "roster" ? null : (
              <details
                className={
                  decision === "start"
                    ? "s-start-selection"
                    : "s-selection-open"
                }
                open={decision !== "start"}
              >
                <summary>Review selected finalists ({selectionCount})</summary>
                <div className="s-decision-grid">
                  {Array.from({ length: selectionCount }, (_, i) => (
                    <Field
                      key={i}
                      label={
                        decision === "start" || decision === "shortlist"
                          ? `Finalist ${i + 1}`
                          : `Choice ${i + 1}`
                      }
                    >
                      <select
                        required
                        value={chosen[i] || ""}
                        onChange={(ev) =>
                          setChosen((ids) =>
                            Array.from({ length: selectionCount }, (_, j) =>
                              i === j ? ev.target.value : ids[j] || "",
                            ),
                          )
                        }
                      >
                        <option value="">Choose a project</option>
                        {selectionPool.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ))}
                </div>
              </details>
            )}
            {(decision === "start" || decision === "roster") && (
              <fieldset className="s-final-roster">
                <legend>Second-pass judges</legend>
                {activeJudges.map((j) => (
                  <label key={j.id}>
                    <input
                      type="checkbox"
                      checked={roster.includes(j.id)}
                      onChange={(ev) =>
                        setRoster((ids) =>
                          ev.target.checked
                            ? [...ids, j.id]
                            : ids.filter((id) => id !== j.id),
                        )
                      }
                    />
                    {j.name}
                  </label>
                ))}
                <small>
                  Only this panel can vote in the second pass. Track assignments
                  and conflicts still apply.
                </small>
              </fieldset>
            )}
            <Field
              label={
                decision === "start" || automaticPublication
                  ? "Notes (optional)"
                  : "Reason for this change"
              }
            >
              <input
                required={decision !== "start" && !automaticPublication}
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
              />
            </Field>
            <ErrorMessage message={error} />
            <button className="s-inverse" disabled={busy}>
              {decision === "start"
                ? "Confirm roster & start second pass"
                : decision === "reset"
                  ? "Reset second pass"
                  : decision === "publish"
                    ? "Archive & lock winners"
                    : "Save changes"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
function Pagination({
  page,
  pages,
  change,
}: {
  page: number;
  pages: number;
  change: (page: number) => void;
}) {
  return pages > 1 ? (
    <div className="s-list-pagination">
      <span>
        Page {page + 1} of {pages}
      </span>
      <div className="s-actions">
        <button disabled={!page} onClick={() => change(page - 1)}>
          ← Previous
        </button>
        <button disabled={page + 1 >= pages} onClick={() => change(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  ) : null;
}
export function JudgePhaseGallery({
  view,
  section,
}: {
  view: EventView;
  section: "Top finalists" | "Winners";
}) {
  const top = section === "Top finalists",
    results = view.publication?.winners || view.liveWinners || [],
    rows: PresentationRow[] = top
      ? (view.shortlist || []).map((project) => ({ project }))
      : results.map((r, i) => ({
          project: r.project,
          place: i + 1,
          score: r.score,
        }));
  return (
    <section className="s-judge-phase">
      <div className="s-section-heading">
        <p className="s-caption">
          {top
            ? "Alphabetical · no ranking implied"
            : view.publication
              ? "Official winners"
              : "Live · provisional until published"}
        </p>
        <FlowPresentation
          eventName={view.event.name}
          title={top ? `Top ${view.event.rules.finalistCount}` : "Winners"}
          rows={rows}
          winners={!top}
          caption={
            top
              ? "Alphabetical · no ranking implied"
              : view.publication
                ? "Official winners"
                : "Provisional live standings"
          }
        />
      </div>
      <div className="s-phase-project-list">
        {rows.map((row) => (
          <article key={row.project.id}>
            {row.place !== undefined && <span>{row.place}</span>}
            <ProjectIcon name={row.project.name} image={row.project.image} />
            <div>
              <strong>{row.project.name}</strong>
              <span>{row.project.team}</span>
            </div>
            {row.score !== undefined && (
              <span className="s-phase-row-score">
                {row.score.toFixed(2)} points
              </span>
            )}
            <details name="judge-phase-project">
              <summary>Details</summary>
              <p>{row.project.description}</p>
              {row.project.demo && (
                <a href={row.project.demo} target="_blank" rel="noreferrer">
                  Demo ↗
                </a>
              )}
            </details>
          </article>
        ))}
      </div>
      {!rows.length && (
        <Empty
          title={
            top
              ? "First-pass judging is in progress"
              : "Waiting for second-pass votes"
          }
          detail={
            top
              ? "Finalists appear after first-pass reviews are complete."
              : "Winners will appear here as the judging panel votes."
          }
        />
      )}
    </section>
  );
}
