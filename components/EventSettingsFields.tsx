"use client";
import type { EventSettings } from "@/domain/event-settings";
export function EventSettingsFields({
  value,
  onChange,
}: {
  value: EventSettings;
  onChange: (value: EventSettings) => void;
}) {
  return (
    <>
      <div className="hackathon-workspace-fields">
        <label className="field">
          <span>Judges per project</span>
          <input
            type="number"
            min={1}
            max={20}
            required
            value={value.requiredReviews}
            onChange={(e) => onChange({ ...value, requiredReviews: +e.target.value })}
          />
        </label>
        <label className="field">
          <span>Finalists</span>
          <input
            type="number"
            min={5}
            max={20}
            required
            value={value.finalistCount}
            onChange={(e) => onChange({ ...value, finalistCount: +e.target.value })}
          />
        </label>
        <label className="field">
          <span>Scoring scale</span>
          <select
            value={value.scoreMax}
            onChange={(e) => onChange({ ...value, scoreMax: +e.target.value as 5 | 10 })}
          >
            <option value={10}>1–10</option>
            <option value={5}>1–5</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>
          <input
            type="checkbox"
            checked={value.submissionsOpen}
            onChange={(e) => onChange({ ...value, submissionsOpen: e.target.checked })}
          />{" "}
          Accept project submissions
        </span>
      </label>
      <details>
        <summary>Sponsors{value.sponsors?.length ? ` (${value.sponsors.length})` : ""}</summary>
        {(value.sponsors || []).map((sponsor, index) => (
          <fieldset key={sponsor.id} className="card" style={{ padding: 16, marginTop: 12 }}>
            <legend>{sponsor.name || "New sponsor"}</legend>
            <div className="hackathon-workspace-fields">
              {(
                [
                  ["name", "Sponsor name"],
                  ["logo", "Logo URL"],
                ] as const
              ).map(([key, label]) => (
                <label className="field" key={key}>
                  <span>
                    {label}
                    {key === "logo" && <small> Optional</small>}
                  </span>
                  <input
                    value={sponsor[key]}
                    required={key === "name"}
                    inputMode={key === "logo" ? "url" : "text"}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        sponsors: (value.sponsors || []).map((other, i) =>
                          i === index ? { ...other, [key]: e.target.value } : other,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onChange({
                  ...value,
                  sponsors: (value.sponsors || []).filter((other) => other.id !== sponsor.id),
                })
              }
            >
              Remove sponsor
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary-button"
          style={{ marginTop: 12 }}
          onClick={() =>
            onChange({
              ...value,
              sponsors: [
                ...(value.sponsors || []),
                { id: crypto.randomUUID(), name: "", logo: "" },
              ],
            })
          }
        >
          Add sponsor
        </button>
        <p className="field-hint">
          Sponsors appear on the Winners screen and TV presentation. A logo is optional.
        </p>
      </details>
      <details>
        <summary>Awards & filtered collections</summary>
        {value.collections.map((c, i) => (
          <fieldset key={c.id} className="card" style={{ padding: 16, marginTop: 12 }}>
            <legend>{c.name || "New collection"}</legend>
            <div className="hackathon-workspace-fields">
              {(
                [
                  ["name", "Collection name"],
                  ["tool", "Tool used"],
                  ["track", "Track"],
                  ["sponsor", "Sponsor"],
                  ["prize", "Award / prize"],
                  ["logo", "Logo URL"],
                ] as const
              ).map(([key, label]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <input
                    type={key === "logo" ? "url" : "text"}
                    required={key === "name"}
                    value={c[key]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        collections: value.collections.map((other, j) =>
                          j === i ? { ...other, [key]: e.target.value } : other,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onChange({
                  ...value,
                  collections: value.collections.filter((other) => other.id !== c.id),
                })
              }
            >
              Remove
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary-button"
          style={{ marginTop: 12 }}
          onClick={() =>
            onChange({
              ...value,
              collections: [
                ...value.collections,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  tool: "",
                  track: "",
                  sponsor: "",
                  prize: "",
                  logo: "",
                },
              ],
            })
          }
        >
          Add collection
        </button>
        <p className="field-hint">
          Optional tool and track filters select matching projects. Sponsor logos and awards appear
          only when configured.
        </p>
      </details>
    </>
  );
}
