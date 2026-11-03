"use client";
import { useState } from "react";
import {
  csvHeaders,
  parseCsv,
  toCsv,
  type EventView,
} from "@/domain/studio/model";
import { api, Empty, ErrorMessage, Field, ProjectIcon } from "./shared";
import { SubmissionEditor } from "./SubmissionEditor";
import type { Project } from "@/domain/studio/model";
import type { RunAction } from "./EventWorkspace";
type Preview = {
  added: number;
  updated: number;
  rows: Record<string, unknown>[];
};
const PAGE_SIZE = 4;
export function ProjectImport({
  view,
  run,
  busy,
}: {
  view: EventView;
  run: RunAction;
  busy: boolean;
}) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Project | null>(null);
  const [source, setSource] = useState<"csv" | "airtable" | "manual" | null>(
      null,
    ),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [query, setQuery] = useState(""),
    [mapping, setMapping] = useState(
      Object.fromEntries(
        csvHeaders.filter((h) => h !== "id").map((h) => [h, h]),
      ),
    ),
    [manual, setManual] = useState<Record<string, string>>({
      name: "",
      team: "",
      description: "",
      track: "",
      tools: "",
      demo: "",
      repository: "",
      image: "",
      email: "",
    });
  const editable = ["draft", "ready"].includes(view.event.stage);
  async function csv(file?: File) {
    if (!file) return;
    setError("");
    setPending(true);
    try {
      if (file.size > 5_000_000)
        throw new Error("Use a CSV smaller than 5 MB.");
      const rows = parseCsv(await file.text());
      setPreview(
        await api<Preview>(`events/${view.event.id}`, {
          action: "preview-import",
          rows,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  function template() {
    const blob = new Blob(
      [
        toCsv(
          [
            {
              id: "project-1",
              name: "A good idea",
              team: "Maya, Alex",
              description: "What it does and why it matters.",
              track: "Community",
              tools: "",
              demo: "",
              repository: "",
              image: "",
              email: "",
            },
          ],
          csvHeaders,
        ),
      ],
      { type: "text/csv" },
    );
    const u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = "hackbuddy-project-template.csv";
    a.click();
    URL.revokeObjectURL(u);
  }
  const filtered = view.projects.filter((p) =>
    `${p.name} ${p.team} ${p.track}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section>
      {editing && (
        <SubmissionEditor
          project={editing}
          view={view}
          run={run}
          busy={busy}
          close={() => setEditing(null)}
        />
      )}
      <div className="s-section-heading">
        <div>
          <h2>Projects</h2>
        </div>
        <div className="s-actions">
          <a
            className="s-button"
            href={`/api/studio/events/${view.event.id}/export?kind=projects`}
          >
            Export projects ↓
          </a>
          {editable && (
            <button
              className="s-inverse"
              onClick={() => {
                setSource("csv");
                setPreview(null);
                setError("");
              }}
            >
              + Import projects
            </button>
          )}
        </div>
      </div>
      {source && editable && (
        <div className="s-import-panel">
          <div className="s-section-heading">
            <div className="s-actions">
              {(["csv", "airtable", "manual"] as const).map((s) => (
                <button
                  key={s}
                  className={source === s ? "s-selected" : ""}
                  onClick={() => {
                    setSource(s);
                    setPreview(null);
                    setError("");
                  }}
                >
                  {s === "csv"
                    ? "CSV file"
                    : s === "airtable"
                      ? "Airtable"
                      : "Add one project"}
                </button>
              ))}
            </div>
            <button aria-label="Close import" onClick={() => setSource(null)}>
              ×
            </button>
          </div>
          <ErrorMessage message={error} />
          {!preview && source === "csv" && (
            <div className="s-upload">
              <span className="s-empty-symbol">↥</span>
              <h3>A little structure goes a long way.</h3>
              <p>
                Use a name column. Add team, description, track, tools, demo,
                repository, image, or email as needed.
              </p>
              <input
                aria-label="Choose project CSV"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => csv(e.target.files?.[0])}
                disabled={pending}
              />
              <button onClick={template}>Download a template ↓</button>
              <small>
                Up to 5 MB · Reimports update matching IDs, or names when no ID
                is supplied.
              </small>
            </div>
          )}
          {!preview && source === "airtable" && (
            <form
              className="s-form"
              action={async (form) => {
                setPending(true);
                setError("");
                try {
                  setPreview(
                    await api<Preview>(`events/${view.event.id}/airtable`, {
                      ...Object.fromEntries(form),
                      mapping,
                    }),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  const el = document.querySelector<HTMLInputElement>(
                    'input[name="token"]',
                  );
                  if (el) el.value = "";
                  setPending(false);
                }
              }}
            >
              <p>
                Read projects from your own Airtable. The token is used for this
                preview and is never stored.
              </p>
              <div className="s-form-columns">
                <Field label="Base ID">
                  <input name="base" placeholder="app…" required />
                </Field>
                <Field label="Table name">
                  <input name="table" placeholder="Projects" required />
                </Field>
              </div>
              <Field label="Read-only personal access token">
                <input
                  name="token"
                  type="password"
                  autoComplete="off"
                  required
                />
              </Field>
              <details>
                <summary>Map your Airtable fields</summary>
                <div className="s-form-columns">
                  {Object.keys(mapping).map((k) => (
                    <Field label={k} key={k}>
                      <input
                        value={mapping[k]}
                        onChange={(e) =>
                          setMapping({ ...mapping, [k]: e.target.value })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </details>
              <button disabled={pending}>
                {pending ? "Reading Airtable…" : "Preview projects →"}
              </button>
            </form>
          )}
          {!preview && source === "manual" && (
            <form
              className="s-form"
              onSubmit={(e) => {
                e.preventDefault();
                setPending(true);
                setError("");
                api<Preview>(`events/${view.event.id}`, {
                  action: "preview-import",
                  rows: [manual],
                })
                  .then(setPreview)
                  .catch((e) => setError(e.message))
                  .finally(() => setPending(false));
              }}
            >
              <div className="s-form-columns">
                {Object.keys(manual).map((k) => (
                  <Field label={k.charAt(0).toUpperCase() + k.slice(1)} key={k}>
                    <input
                      required={k === "name"}
                      type={
                        ["demo", "repository", "image"].includes(k)
                          ? "url"
                          : k === "email"
                            ? "email"
                            : "text"
                      }
                      value={manual[k]}
                      onChange={(e) =>
                        setManual({ ...manual, [k]: e.target.value })
                      }
                    />
                  </Field>
                ))}
              </div>
              <button disabled={pending}>Preview project →</button>
            </form>
          )}
          {preview && (
            <>
              <div className="s-section-heading">
                <div>
                  <h3>Looking good.</h3>
                  <p>
                    {preview.added} new · {preview.updated} updated ·{" "}
                    {preview.rows.length} total
                  </p>
                </div>
                <div className="s-actions">
                  <button onClick={() => setPreview(null)}>Start over</button>
                  <button
                    className="s-inverse"
                    disabled={busy}
                    onClick={() =>
                      run({
                        action: "import",
                        rows: preview.rows.map((p) => ({
                          ...p,
                          id: p.externalId || "",
                        })),
                      })
                        .then(() => {
                          setSource(null);
                          setPreview(null);
                        })
                        .catch(() => {})
                    }
                  >
                    Confirm import ↗
                  </button>
                </div>
              </div>
              <div className="s-table-wrap">
                <table className="s-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Team</th>
                      <th>Track</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((p, i) => (
                      <tr key={i}>
                        <td>{String(p.name)}</td>
                        <td>{String(p.team || "—")}</td>
                        <td>{String(p.track || "—")}</td>
                        <td>{String(p.description || "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 50 && (
                <p>
                  Showing the first 50 rows. All {preview.rows.length} validated
                  projects will be imported.
                </p>
              )}
            </>
          )}
        </div>
      )}
      <input
        className="s-search"
        aria-label="Search projects"
        placeholder="Search projects, teams, tracks…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
      />
      {filtered.length ? (
        <div className="s-table-wrap">
          <table className="s-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Team</th>
                <th>Track</th>
                <th>Tools</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(
                  Math.min(
                    page,
                    Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1),
                  ) * PAGE_SIZE,
                  (Math.min(
                    page,
                    Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1),
                  ) +
                    1) *
                    PAGE_SIZE,
                )
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="s-project-cell">
                        <ProjectIcon name={p.name} image={p.image} />
                        <div>
                          <strong>{p.name}</strong>
                          {p.description && (
                            <details className="s-project-description">
                              <summary>Details</summary>
                              <p>{p.description}</p>
                            </details>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{p.team || "—"}</td>
                    <td>{p.track || "—"}</td>
                    <td>{p.tools || "—"}</td>
                    <td>
                      <button onClick={() => setEditing(p)}>Edit</button>
                      {editable && (
                        <details
                          className="s-judge-actions"
                          name="project-actions"
                        >
                          <summary>Actions</summary>
                          <button
                            aria-label={`Remove ${p.name}`}
                            disabled={busy}
                            onClick={() =>
                              run({
                                action: "remove-project",
                                projectId: p.id,
                              }).catch(() => {})
                            }
                          >
                            Remove
                          </button>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {filtered.length > PAGE_SIZE && (
            <div className="s-list-pagination">
              <span>
                Page{" "}
                {Math.min(page + 1, Math.ceil(filtered.length / PAGE_SIZE))} of{" "}
                {Math.ceil(filtered.length / PAGE_SIZE)} · {filtered.length}{" "}
                projects
              </span>
              <div className="s-actions">
                <button
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ← Previous
                </button>
                <button
                  disabled={page >= Math.ceil(filtered.length / PAGE_SIZE) - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Empty
          title={query ? "No matching projects." : "The room is yours."}
          detail={
            query
              ? "Try a different search."
              : "Add your first project to bring this event to life."
          }
        />
      )}
    </section>
  );
}
