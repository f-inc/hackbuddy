"use client";
import { useState } from "react";
import Link from "next/link";
import type { EventView, Rank } from "@/domain/studio/model";
import { Empty, ErrorMessage, Field, Progress } from "./shared";
import type { RunAction } from "./EventWorkspace";
const PAGE_SIZE = 4;
export function EventResults({
  view,
  run,
  busy,
}: {
  view: EventView;
  run: RunAction;
  busy: boolean;
}) {
  const [dialogError, setDialogError] = useState("");
  const [dialog, setDialog] = useState<
      "start-final" | "publish" | "revise" | null
    >(null),
    [selection, setSelection] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [round, setRound] = useState("current"),
    [revision, setRevision] = useState<number | null>(null);
  const e = view.event,
    ranked =
      e.rules.template === "single" ||
      e.stage === "judging" ||
      ["draft", "ready"].includes(e.stage) ||
      round === "preliminary"
        ? view.preliminary
        : view.results;
  function open(kind: typeof dialog) {
    setDialogError("");
    setDialog(kind);
    setReason("");
    setSelection(
      kind === "start-final"
        ? view.preliminary
            .slice(0, Math.min(e.rules.finalistCount, view.projects.length))
            .map((v) => v.project.id)
        : (
            view.publication?.winners ||
            view.results.slice(0, e.rules.winnerCount)
          ).map((v) => v.project.id),
    );
  }
  const pool =
    dialog === "start-final" || e.rules.template === "single"
      ? view.preliminary
      : view.results;
  const count = Math.min(
    dialog === "start-final" ? e.rules.finalistCount : e.rules.winnerCount,
    pool.length,
  );
  const snapshot =
    view.publications.find((p) => p.revision === revision) || view.publication;
  if (["draft", "ready"].includes(e.stage))
    return (
      <section>
        <div className="s-section-heading">
          <h2>Results</h2>
        </div>
        <Empty
          title="No reviews yet."
          detail="Open judging to collect scores and see the results here."
        />
      </section>
    );
  return (
    <section>
      <div className="s-section-heading">
        <div className="s-results-title">
          <h2>Results</h2>
          <details className="s-scoring-help">
            <summary>How scores work</summary>
            <p>
              {e.rules.scoring === "average"
                ? "Weighted rubric scores, scaled to 100. Final ballots use your configured points."
                : "Judge-normalized scores. Raw scores remain available in exports."}
            </p>
          </details>
        </div>
        <details className="s-result-exports">
          <summary className="s-button">Export ↓</summary>
          <div className="s-actions">
            <a
              className="s-button"
              href={`/api/studio/events/${e.id}/export?kind=results`}
            >
              Export results ↓
            </a>
            <a
              className="s-button"
              href={`/api/studio/events/${e.id}/export?kind=reviews`}
            >
              Export reviews ↓
            </a>
          </div>
        </details>
      </div>
      <div className="s-round-panel">
        <div>
          <h3>
            {
              {
                draft: "Setup in progress",
                ready: "Ready to open judging",
                judging: "Preliminary judging",
                final: "Final judging",
                published: "Results published",
                archived: "Hackathon archived",
              }[e.stage]
            }
          </h3>
          <p>
            {e.stage === "final" && e.rules.template === "ranked-final"
              ? `${view.stats.ballots} of ${view.judges.filter((j) => j.active).length} active judges have submitted ballots. Quorum: ${e.rules.quorum === "all" ? "all eligible judges" : "at least one ballot"}.`
              : `${view.stats.complete} of ${view.stats.required} projects have the required review coverage.`}
          </p>
          <Progress value={view.stats.complete} max={view.stats.required} />
        </div>
        <div className="s-actions">
          {e.stage === "judging" && e.rules.template !== "single" && (
            <>
              <button
                className="s-inverse"
                disabled={busy}
                onClick={() => run({ action: "start-final" }).catch(() => {})}
              >
                Select finalists & open final ↗
              </button>
              <details className="s-result-decisions">
                <summary>More options</summary>
                <button
                  onClick={(event) => {
                    open("start-final");
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                  }}
                >
                  Resolve finalist tie / override
                </button>
              </details>
            </>
          )}
          {((e.stage === "judging" && e.rules.template === "single") ||
            e.stage === "final") && (
            <>
              <button
                className="s-inverse"
                disabled={busy}
                onClick={() => run({ action: "publish" }).catch(() => {})}
              >
                Publish official results ↗
              </button>
              <details className="s-result-decisions">
                <summary>More options</summary>
                <button
                  onClick={(event) => {
                    open("publish");
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                  }}
                >
                  Resolve ties / select winners
                </button>
              </details>
            </>
          )}
          {view.publication && (
            <>
              <Link
                className="s-button s-inverse"
                target="_blank"
                href={`/showcase/${e.slug}`}
              >
                See the celebration ↗
              </Link>
              <details className="s-result-decisions">
                <summary>More options</summary>
                <button
                  onClick={(event) => {
                    open("revise");
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                  }}
                >
                  Correct published results
                </button>
              </details>
            </>
          )}
        </div>
      </div>
      {view.publication && (
        <section className="s-published">
          <div className="s-section-heading">
            <div>
              <span className="s-eyebrow">Official publication</span>
              <h3>{snapshot?.eventName}</h3>
              <p>
                {snapshot && new Date(snapshot.publishedAt).toLocaleString()} ·
                Published by {snapshot?.publishedBy}
              </p>
            </div>
            <select
              aria-label="Publication revision"
              value={revision || view.publication.revision}
              onChange={(ev) => setRevision(+ev.target.value)}
            >
              {view.publications.map((p) => (
                <option value={p.revision} key={p.id}>
                  Revision {p.revision}
                </option>
              ))}
            </select>
          </div>
          <div className="s-winner-strip">
            {snapshot?.winners.map((r, i) => (
              <div key={r.project.id}>
                <span className="s-eyebrow">
                  {i + 1}
                  {["st", "nd", "rd"][i] || "th"} place
                </span>
                <h3>{r.project.name}</h3>
                <p>{r.project.team}</p>
              </div>
            ))}
          </div>
          {snapshot?.reason && <p>Decision note: {snapshot.reason}</p>}
        </section>
      )}
      {e.finalists.length > 0 && (
        <div className="s-actions s-round-toggle">
          <button
            className={round === "current" ? "s-selected" : ""}
            onClick={() => setRound("current")}
          >
            Final round
          </button>
          <button
            className={round === "preliminary" ? "s-selected" : ""}
            onClick={() => setRound("preliminary")}
          >
            Preliminary
          </button>
          <Link
            href={`/showcase/${e.slug}?view=finalists&tv=1`}
            target="_blank"
          >
            Present finalists ↗
          </Link>
        </div>
      )}
      {view.publication ? (
        <details className="s-standings-disclosure">
          <summary>All standings</summary>
          <Ranking rows={ranked} />
        </details>
      ) : (
        <Ranking rows={ranked} />
      )}
      {view.reservations.length > 0 && (
        <details className="s-reservations-disclosure">
          <summary>Active reservations · {view.reservations.length}</summary>
          <p>
            Reservations renew while judges are active. Releasing a reservation
            preserves the draft.
          </p>
          {view.reservations.length ? (
            <div className="s-table-wrap">
              <table className="s-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Judge</th>
                    <th>Expires</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {view.reservations.map((r) => (
                    <tr key={`${r.round}:${r.projectId}`}>
                      <td>
                        {view.projects.find((p) => p.id === r.projectId)?.name}
                      </td>
                      <td>
                        {view.judges.find((j) => j.id === r.judgeId)?.name}
                      </td>
                      <td>{new Date(r.expiresAt).toLocaleTimeString()}</td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run({
                              action: "release",
                              projectId: r.projectId,
                            }).catch(() => {})
                          }
                        >
                          Release
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="s-note">No active reservations.</div>
          )}
        </details>
      )}
      {dialog && (
        <div className="s-modal-backdrop">
          <form
            className="s-modal s-form"
            role="dialog"
            aria-modal="true"
            aria-label="Record result decision"
            onSubmit={(ev) => {
              ev.preventDefault();
              run({
                action: dialog,
                [dialog === "start-final" ? "finalistIds" : "winnerIds"]:
                  selection,
                reason,
              })
                .then(() => setDialog(null))
                .catch((err) => setDialogError(err.message));
            }}
          >
            <div className="s-section-heading">
              <h2>
                {dialog === "start-final"
                  ? "Choose the finalists."
                  : "Record the decision."}
              </h2>
              <button
                type="button"
                onClick={() => setDialog(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p>
              {dialog === "revise"
                ? "This creates a new, immutable revision. Earlier results remain in the event history."
                : "Use this to resolve a tie or record a deliberation decision. The reason becomes part of the publication record."}
            </p>
            {Array.from({ length: count }, (_, i) => (
              <Field
                key={i}
                label={
                  dialog === "start-final"
                    ? `Finalist ${i + 1}`
                    : `Winner · place ${i + 1}`
                }
              >
                <select
                  value={selection[i] || ""}
                  required
                  onChange={(ev) =>
                    setSelection((v) =>
                      Array.from({ length: count }, (_, j) =>
                        j === i ? ev.target.value : v[j] || "",
                      ),
                    )
                  }
                >
                  <option value="">Choose a project</option>
                  {pool.map((v) => (
                    <option key={v.project.id} value={v.project.id}>
                      {v.project.name} · {v.score.toFixed(2)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <Field label="Decision reason">
              <textarea
                required
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                placeholder="What informed this decision?"
              />
            </Field>
            <ErrorMessage message={dialogError} />
            <button className="s-inverse" disabled={busy}>
              {busy
                ? "Saving…"
                : dialog === "start-final"
                  ? "Open final round ↗"
                  : "Publish this decision ↗"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
function Ranking({ rows }: { rows: Rank[] }) {
  const [page, setPage] = useState(0);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1),
  );
  return (
    <div className="s-table-wrap">
      <table className="s-table">
        <thead>
          <tr>
            <th>Position</th>
            <th>Project</th>
            <th>Team</th>
            <th>Score</th>
            <th>Reviews / ballots</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows
            .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
            .map((r, i) => (
              <tr key={r.project.id}>
                <td className="s-muted">{currentPage * PAGE_SIZE + i + 1}</td>
                <td>
                  <strong>{r.project.name}</strong>
                </td>
                <td>{r.project.team || "—"}</td>
                <td>{r.score.toFixed(2)}</td>
                <td>{r.reviews}</td>
                <td>
                  {r.reviews === 0 ? (
                    <span className="s-tag">Awaiting scores</span>
                  ) : (
                    r.tied && <span className="s-tag">Tied</span>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {rows.length > PAGE_SIZE && (
        <div className="s-list-pagination">
          <span>
            Page {currentPage + 1} of {Math.ceil(rows.length / PAGE_SIZE)}
          </span>
          <div className="s-actions">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              ← Previous
            </button>
            <button
              disabled={(currentPage + 1) * PAGE_SIZE >= rows.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      )}
      {!rows.length && (
        <p className="s-note">
          Scores will appear as projects enter this round.
        </p>
      )}
    </div>
  );
}
