"use client";
import { useState } from "react";
import type { EventView, Judge } from "@/domain/studio/model";
import { Empty, Field } from "./shared";
import type { RunAction } from "./EventWorkspace";
export function JudgeRoster({
  view,
  run,
  busy,
}: {
  view: EventView;
  run: RunAction;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<Partial<Judge> | null>(null),
    [copied, setCopied] = useState("");
  const closed = ["published", "archived"].includes(view.event.stage);
  const tracks = [
    ...new Set(view.projects.map((p) => p.track).filter(Boolean)),
  ];
  return (
    <section>
      <div className="s-section-heading">
        <div>
          <h2>Good people. Good judgment.</h2>
          <p>Names and an event password. No account setup for judges.</p>
        </div>
        {!closed && (
          <button
            className="s-inverse"
            onClick={() =>
              setEditing({ name: "", active: true, tracks: [], conflicts: [] })
            }
          >
            + Invite a judge
          </button>
        )}
      </div>
      <div className="s-note">
        {view.event.rules.guests
          ? "Anyone with your event password can join. Turn off open judge access in settings to require an invitation."
          : "Only the active names below can sign in. Share the event password separately."}{" "}
        A judge’s name is their sign-in identity; use distinct names within this
        event.
      </div>
      {editing && (
        <form
          className="s-import-panel s-form"
          onSubmit={(e) => {
            e.preventDefault();
            run({ action: "judge", ...editing })
              .then(() => setEditing(null))
              .catch(() => {});
          }}
        >
          <div className="s-section-heading">
            <h3>
              {editing.id ? "Edit judge access." : "A seat at the table."}
            </h3>
            <button
              type="button"
              aria-label="Close judge editor"
              onClick={() => setEditing(null)}
            >
              ×
            </button>
          </div>
          <Field
            label="Judge’s name"
            hint="This is the name they enter to sign in. You can rename it later without losing their reviews."
          >
            <input
              required
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </Field>
          <Field
            label="Expertise tracks"
            hint="Leave empty to review all tracks."
          >
            <select
              multiple
              value={editing.tracks}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  tracks: Array.from(e.target.selectedOptions, (o) => o.value),
                })
              }
            >
              {tracks.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Conflicts of interest"
            hint="These projects will never be assigned to this judge."
          >
            <select
              multiple
              value={editing.conflicts}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  conflicts: Array.from(
                    e.target.selectedOptions,
                    (o) => o.value,
                  ),
                })
              }
            >
              {view.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="s-toggle">
            <input
              type="checkbox"
              checked={editing.active}
              onChange={(e) =>
                setEditing({ ...editing, active: e.target.checked })
              }
            />
            Active access
          </label>
          <button className="s-inverse" disabled={busy}>
            Save invitation ↗
          </button>
        </form>
      )}
      {copied && <p role="status">{copied}</p>}
      {view.judges.length ? (
        <div className="s-table-wrap">
          <table className="s-table">
            <thead>
              <tr>
                <th>Judge</th>
                <th>Expertise</th>
                <th>Conflicts</th>
                <th>Reviews</th>
                <th>Access</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {view.judges.map((j) => (
                <tr key={j.id}>
                  <td>
                    <strong>{j.name}</strong>
                  </td>
                  <td>{j.tracks.join(", ") || "All tracks"}</td>
                  <td>
                    {j.conflicts
                      .map((id) => view.projects.find((p) => p.id === id)?.name)
                      .join(", ") || "None"}
                  </td>
                  <td>
                    {view.reviews.filter((r) => r.judgeId === j.id).length}
                  </td>
                  <td>
                    <span className="s-tag">
                      {j.active ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td>
                    <div className="s-actions">
                      <button
                        onClick={() =>
                          navigator.clipboard
                            .writeText(
                              `${location.origin}/events/${view.event.slug}?name=${encodeURIComponent(j.name)}`,
                            )
                            .then(() =>
                              setCopied(
                                `Invitation link copied for ${j.name}. Share the password separately.`,
                              ),
                            )
                            .catch(() =>
                              setCopied(
                                `${location.origin}/events/${view.event.slug}?name=${encodeURIComponent(j.name)}`,
                              ),
                            )
                        }
                      >
                        Copy invite ↗
                      </button>
                      {!closed && (
                        <>
                          <button onClick={() => setEditing({ ...j })}>
                            Edit
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              run({
                                action: "judge",
                                ...j,
                                active: !j.active,
                              }).catch(() => {})
                            }
                          >
                            {j.active ? "Revoke" : "Restore"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="A fresh perspective awaits."
          detail="Invite judges to review your projects. You can tailor assignments by track and exclude conflicts."
        />
      )}
    </section>
  );
}
