"use client";
import { useState } from "react";
import type { EventView, Project, Review } from "@/domain/studio/model";
import type { RunAction } from "./EventWorkspace";
import { Empty, ErrorMessage, Field } from "./shared";
export function SubmissionEditor({
  project,
  view,
  run,
  busy,
  close,
  initialTab = "Project",
}: {
  project: Project;
  view: EventView;
  run: RunAction;
  busy: boolean;
  close: () => void;
  initialTab?: "Project" | "Scores";
}) {
  const currentProject =
    view.projects.find((row) => row.id === project.id) || project;
  const [tab, setTab] = useState(initialTab),
    [draft, setDraft] = useState(currentProject),
    [error, setError] = useState("");
  const reviews = view.reviews.filter((r) => r.projectId === project.id);
  const [reviewId, setReviewId] = useState(reviews[0]?.id || "");
  const review = reviews.find((r) => r.id === reviewId);
  return (
    <div className="s-modal-backdrop">
      <section
        className="s-modal s-submission-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${currentProject.name}`}
      >
        <div className="s-section-heading">
          <h2>{currentProject.name}</h2>
          <button aria-label="Close editor" onClick={close}>
            ×
          </button>
        </div>
        <div className="s-tabs">
          <button
            className={tab === "Project" ? "s-selected" : ""}
            onClick={() => setTab("Project")}
          >
            Submission
          </button>
          <button
            className={tab === "Scores" ? "s-selected" : ""}
            onClick={() => setTab("Scores")}
          >
            Judge scores · {reviews.length}
          </button>
        </div>
        <ErrorMessage message={error} />
        {tab === "Project" ? (
          <form
            className="s-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await run({
                  action: "edit-project",
                  projectId: project.id,
                  project: draft,
                });
                close();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <div className="s-form-columns">
              {(
                [
                  ["name", "Project name"],
                  ["team", "Team members"],
                  ["track", "Track"],
                  ["tools", "Tools used"],
                  ["demo", "Demo URL"],
                  ["repository", "Source URL"],
                  ["image", "Image URL"],
                  ["email", "Contact email"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type={
                      ["demo", "repository", "image"].includes(key)
                        ? "url"
                        : key === "email"
                          ? "email"
                          : "text"
                    }
                    required={key === "name"}
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [key]: e.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
            <Field label="Description">
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
              />
            </Field>
            <button className="s-inverse" disabled={busy}>
              Save submission
            </button>
            {view.publication && (
              <p className="s-caption">
                Published snapshots stay unchanged. Publish a correction to
                update the official results.
              </p>
            )}
          </form>
        ) : reviews.length ? (
          <>
            <Field label="Review to edit">
              <select
                value={reviewId}
                onChange={(e) => setReviewId(e.target.value)}
              >
                {reviews.map((r) => (
                  <option key={r.id} value={r.id}>
                    {view.judges.find((j) => j.id === r.judgeId)?.name ||
                      "Judge"}{" "}
                    · {r.round === "preliminary" ? "First pass" : "Second pass"}
                  </option>
                ))}
              </select>
            </Field>
            {review && (
              <ReviewEditor
                key={review.id}
                review={review}
                view={view}
                run={run}
                busy={busy}
                close={close}
              />
            )}
          </>
        ) : (
          <Empty
            title="No submitted scores yet"
            detail="Scores appear here after a judge reviews this project."
          />
        )}
      </section>
    </div>
  );
}
function ReviewEditor({
  review,
  view,
  run,
  busy,
  close,
}: {
  review: Review;
  view: EventView;
  run: RunAction;
  busy: boolean;
  close: () => void;
}) {
  const [scores, setScores] = useState(review.scores),
    [notes, setNotes] = useState(review.notes),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="s-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await run({
            action: "edit-review",
            reviewId: review.id,
            scores,
            notes,
            reason,
          });
          close();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      {view.event.rules.criteria.map((c) => (
        <Field key={c.id} label={c.name}>
          <input
            type="number"
            min={c.min}
            max={c.max}
            required
            value={scores[c.id] ?? ""}
            onChange={(e) =>
              setScores((s) => ({ ...s, [c.id]: +e.target.value }))
            }
          />
        </Field>
      ))}
      <Field label="Judge notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Field label="Reason for correction">
        <input
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <ErrorMessage message={error} />
      <button className="s-inverse" disabled={busy}>
        Update score
      </button>
      <p className="s-caption">
        The original score and correction are retained in the activity log.
        {view.publication
          ? " Official results change only after you publish a correction."
          : ""}
      </p>
    </form>
  );
}
