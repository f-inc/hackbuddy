"use client";
import { useState } from "react";
import type { EventView, Rules, Award } from "@/domain/studio/model";
import { Field, formats } from "./shared";
import type { RunAction } from "./EventWorkspace";
export function EventSettings({
  view,
  run,
  busy,
}: {
  view: EventView;
  run: RunAction;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(() => ({
    name: view.event.name,
    description: view.event.description,
    image: view.event.image,
    rules: structuredClone(view.event.rules),
    sponsors: structuredClone(view.event.sponsors),
    password: "",
  }));
  const [pointText, setPointText] = useState(draft.rules.points.join(", "));
  const editable = ["draft", "ready"].includes(view.event.stage),
    r = draft.rules;
  const change = <K extends keyof Rules>(key: K, value: Rules[K]) =>
    setDraft((d) => ({ ...d, rules: { ...d.rules, [key]: value } }));
  const award = (i: number, key: keyof Award, value: string) =>
    setDraft((d) => ({
      ...d,
      sponsors: d.sponsors.map((a, j) =>
        j === i ? { ...a, [key]: value } : a,
      ),
    }));
  return (
    <form
      className="s-settings"
      onSubmit={(e) => {
        e.preventDefault();
        run({
          action: "update",
          ...draft,
          rules: { ...draft.rules, points: pointText.split(",").map(Number) },
        })
          .then(() => setDraft((d) => ({ ...d, password: "" })))
          .catch(() => {});
      }}
    >
      <div className="s-section-heading">
        <div>
          <h2>Your event. Your rules.</h2>
          <p>
            {editable
              ? "Make it fit the way your community creates."
              : "The judging configuration was frozen when the event opened."}
          </p>
        </div>
        {editable && (
          <button className="s-inverse" disabled={busy}>
            Save settings ↗
          </button>
        )}
      </div>
      <fieldset disabled={!editable || busy}>
        <section className="s-settings-section">
          <div>
            <h3>The essentials.</h3>
            <p>The name and story behind your event.</p>
          </div>
          <div className="s-form">
            <Field label="Event name">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Description">
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            <Field label="Event artwork URL">
              <input
                type="url"
                value={draft.image}
                onChange={(e) => setDraft({ ...draft, image: e.target.value })}
                placeholder="https://…"
              />
            </Field>
            <Field
              label="Change judge password"
              hint={
                view.event.passwordSet
                  ? "A password is already set. Leave blank to keep it."
                  : "Set a password before opening judging."
              }
            >
              <input
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={draft.password}
                onChange={(e) =>
                  setDraft({ ...draft, password: e.target.value })
                }
              />
            </Field>
          </div>
        </section>
        <section className="s-settings-section">
          <div>
            <h3>A format that fits.</h3>
            <p>Start simple or give your finalists another moment.</p>
          </div>
          <div className="s-form">
            <Field label="Judging format">
              <select
                value={r.template}
                onChange={(e) =>
                  change("template", e.target.value as Rules["template"])
                }
              >
                {Object.entries(formats).map(([v, label]) => (
                  <option value={v} key={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="s-form-columns">
              <Field label="Reviews per project">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={r.reviews}
                  onChange={(e) => change("reviews", +e.target.value)}
                />
              </Field>
              <Field label="Winners">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={r.winnerCount}
                  onChange={(e) => {
                    const n = +e.target.value;
                    change("winnerCount", n);
                    setPointText(
                      Array.from(
                        { length: Math.max(1, Math.min(20, n)) },
                        (_, i) => Math.max(1, n - i),
                      ).join(", "),
                    );
                    change(
                      "points",
                      Array.from(
                        { length: Math.max(1, Math.min(20, n)) },
                        (_, i) => Math.max(1, n - i),
                      ),
                    );
                    if (n > r.finalistCount) change("finalistCount", n);
                  }}
                />
              </Field>
            </div>
            {r.template !== "single" && (
              <div className="s-form-columns">
                <Field label="Finalists">
                  <input
                    type="number"
                    min={r.winnerCount}
                    max={100}
                    value={r.finalistCount}
                    onChange={(e) => change("finalistCount", +e.target.value)}
                  />
                </Field>
                {r.template === "scored-final" ? (
                  <Field label="Final reviews per project">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={r.finalReviews}
                      onChange={(e) => change("finalReviews", +e.target.value)}
                    />
                  </Field>
                ) : (
                  <Field label="Final ballot quorum">
                    <select
                      value={r.quorum}
                      onChange={(e) =>
                        change("quorum", e.target.value as Rules["quorum"])
                      }
                    >
                      <option value="all">All eligible active judges</option>
                      <option value="one">At least one submitted ballot</option>
                    </select>
                  </Field>
                )}
              </div>
            )}
            {r.template === "ranked-final" && (
              <Field
                label="Ballot points, in order"
                hint="One value per winner, highest first. Example: 5, 3, 1"
              >
                <input
                  value={pointText}
                  onChange={(e) => setPointText(e.target.value)}
                />
              </Field>
            )}
            <Field
              label="Scoring method"
              hint={
                r.scoring === "normalized"
                  ? "Centers scores within each judge, with shrinkage for small samples. Review overlap still matters."
                  : "Scores are scaled to 0–100, weighted by criterion, then averaged."
              }
            >
              <select
                value={r.scoring}
                onChange={(e) =>
                  change("scoring", e.target.value as Rules["scoring"])
                }
              >
                <option value="average">Weighted average</option>
                <option value="normalized">Judge-normalized scores</option>
              </select>
            </Field>
          </div>
        </section>
        <section className="s-settings-section">
          <div>
            <h3>What matters here?</h3>
            <p>
              Every criterion has its own guidance, scale, and weight. Ties
              require an organizer decision with a recorded reason.
            </p>
          </div>
          <div className="s-form">
            {r.criteria.map((c, i) => (
              <div key={c.id} className="s-criterion-edit">
                <div className="s-section-heading">
                  <span className="s-eyebrow">Criterion {i + 1}</span>
                  <button
                    type="button"
                    disabled={r.criteria.length <= 1}
                    onClick={() =>
                      change(
                        "criteria",
                        r.criteria.filter((v) => v.id !== c.id),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
                <Field label="Name">
                  <input
                    value={c.name}
                    required
                    onChange={(e) =>
                      change(
                        "criteria",
                        r.criteria.map((v) =>
                          v.id === c.id ? { ...v, name: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Judge guidance">
                  <textarea
                    value={c.guidance}
                    onChange={(e) =>
                      change(
                        "criteria",
                        r.criteria.map((v) =>
                          v.id === c.id
                            ? { ...v, guidance: e.target.value }
                            : v,
                        ),
                      )
                    }
                  />
                </Field>
                <div className="s-form-columns s-three">
                  {(["min", "max", "weight"] as const).map((k) => (
                    <Field
                      key={k}
                      label={
                        { min: "Minimum", max: "Maximum", weight: "Weight" }[k]
                      }
                    >
                      <input
                        type="number"
                        value={c[k]}
                        min={k === "weight" ? 0.1 : 0}
                        max={100}
                        step={k === "weight" ? 0.1 : 1}
                        onChange={(e) =>
                          change(
                            "criteria",
                            r.criteria.map((v) =>
                              v.id === c.id
                                ? { ...v, [k]: +e.target.value }
                                : v,
                            ),
                          )
                        }
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={r.criteria.length >= 12}
              onClick={() =>
                change("criteria", [
                  ...r.criteria,
                  {
                    id: `criterion-${crypto.randomUUID().slice(0, 8)}`,
                    name: "",
                    guidance: "",
                    min: 1,
                    max: 5,
                    weight: 1,
                  },
                ])
              }
            >
              + Add a criterion
            </button>
          </div>
        </section>
        <section className="s-settings-section">
          <div>
            <h3>The right people.</h3>
            <p>
              Keep judge access simple. Use the roster when you want a closed
              group.
            </p>
          </div>
          <div className="s-form">
            <label className="s-toggle">
              <input
                type="checkbox"
                checked={r.guests}
                onChange={(e) => change("guests", e.target.checked)}
              />
              <span>Allow new judges with the event password</span>
            </label>
            <p className="s-caption">
              When off, a judge’s name must match an active invitation. Names
              are the sign-in identity within this event; invite people with
              distinct names.
            </p>
            <Field label="Project reservation, minutes">
              <input
                type="number"
                min={2}
                max={120}
                value={r.reservationMinutes}
                onChange={(e) => change("reservationMinutes", +e.target.value)}
              />
            </Field>
          </div>
        </section>
        <section className="s-settings-section">
          <div>
            <h3>Partners & collections.</h3>
            <p>
              Give a sponsor, a tool, or a track its own place in the showcase.
            </p>
          </div>
          <div className="s-form">
            {draft.sponsors.map((a, i) => (
              <div className="s-criterion-edit" key={a.id}>
                <div className="s-section-heading">
                  <span className="s-eyebrow">Collection {i + 1}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        sponsors: d.sponsors.filter((v) => v.id !== a.id),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
                {(
                  ["name", "sponsor", "prize", "tool", "track", "logo"] as const
                ).map((k) => (
                  <Field
                    key={k}
                    label={
                      {
                        name: "Collection name",
                        sponsor: "Partner name",
                        prize: "Award or prize",
                        tool: "Tools include",
                        track: "Track equals",
                        logo: "Partner logo URL",
                      }[k]
                    }
                  >
                    <input
                      value={a[k]}
                      required={k === "name"}
                      type={k === "logo" ? "url" : "text"}
                      onChange={(e) => award(i, k, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  sponsors: [
                    ...d.sponsors,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      sponsor: "",
                      logo: "",
                      tool: "",
                      track: "",
                      prize: "",
                    },
                  ],
                }))
              }
            >
              + Add a collection
            </button>
          </div>
        </section>
      </fieldset>
      <section className="s-settings-section">
        <div>
          <h3>Who sees what.</h3>
          <p>
            Visibility can change during the event. Notes and contact details
            stay private.
          </p>
        </div>
        <div className="s-form">
          <Field label="Scores visible to judges">
            <select
              value={r.visibility}
              onChange={(e) =>
                change("visibility", e.target.value as Rules["visibility"])
              }
            >
              <option value="blind">Blind — organizer only</option>
              <option value="after-review">After they review a project</option>
              <option value="live">Live aggregate scores</option>
            </select>
          </Field>
          <label className="s-toggle">
            <input
              type="checkbox"
              checked={r.publicGallery}
              onChange={(e) => change("publicGallery", e.target.checked)}
            />
            Enable the public project showcase
          </label>
          <label className="s-toggle">
            <input
              type="checkbox"
              checked={r.publicResults}
              onChange={(e) => change("publicResults", e.target.checked)}
            />
            Show official results after publication
          </label>
          {!editable && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run({
                  action: "visibility",
                  visibility: r.visibility,
                  publicGallery: r.publicGallery,
                  publicResults: r.publicResults,
                }).catch(() => {})
              }
            >
              Save visibility
            </button>
          )}
        </div>
      </section>
      {editable && (
        <div className="s-sticky-save">
          <span>Settings freeze when judging opens.</span>
          <button className="s-inverse" disabled={busy}>
            {busy ? "Saving…" : "Save event settings ↗"}
          </button>
        </div>
      )}
    </form>
  );
}
