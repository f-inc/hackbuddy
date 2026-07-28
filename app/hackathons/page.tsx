"use client";

import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { HackathonConfig } from "@/lib/hackathons";
import { FormEvent, useCallback, useEffect, useState } from "react";

type FormState = {
  name: string;
  slug: string;
  baseId: string;
  tableName: string;
  imageUrl: string;
  squareImageUrl: string;
};

type AirtableBaseOption = {
  id: string;
  name: string;
  permissionLevel?: string;
};

type AirtableTableOption = {
  id: string;
  name: string;
};

const emptyForm: FormState = {
  name: "",
  slug: "",
  baseId: "",
  tableName: "",
  imageUrl: "",
  squareImageUrl: "",
};

function isLumaEventUrl(value: string) {
  try {
    const host = new URL(value).hostname;
    return ["lu.ma", "www.lu.ma", "luma.com", "www.luma.com"].includes(host);
  } catch {
    return false;
  }
}

export default function HackathonsPage() {
  const [name, setName] = useState("");
  const [hackathons, setHackathons] = useState<HackathonConfig[]>([]);
  const [editing, setEditing] = useState<HackathonConfig | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [resolvingImage, setResolvingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [airtableBases, setAirtableBases] = useState<AirtableBaseOption[]>([]);
  const [airtableTables, setAirtableTables] = useState<AirtableTableOption[]>([]);
  const [loadingBases, setLoadingBases] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [airtableError, setAirtableError] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/hackathons");
    if (response.status === 401) {
      window.location.href = "/";
      return;
    }
    const data = (await response.json()) as {
      hackathons?: HackathonConfig[];
      error?: string;
    };
    if (!response.ok) throw new Error(data.error);
    setHackathons(data.hackathons || []);
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        const sessionResponse = await fetch("/api/auth/session");
        if (!sessionResponse.ok) {
          window.location.href = "/";
          return;
        }
        const session = (await sessionResponse.json()) as {
          name: string;
          role: "judge" | "admin";
          hackathon?: string;
        };
        if (session.role !== "admin") {
          window.location.href = session.hackathon
            ? `/${session.hackathon}/dashboard`
            : "/";
          return;
        }
        setName(session.name);
        await refresh();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Hackathons could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    }
    void initialize();
  }, [refresh]);

  const closeEditor = useCallback(() => {
    if (saving) return;
    setEditing(null);
    setForm(emptyForm);
    setEditorOpen(false);
    setEditingImage(false);
    setResolvingImage(false);
    setImageError("");
    setAirtableError("");
    setError("");
  }, [saving]);

  useEffect(() => {
    if (!editorOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeEditor();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeEditor, editorOpen]);

  useEffect(() => {
    if (!editorOpen || editingImage) return;

    const controller = new AbortController();
    async function loadBases() {
      setLoadingBases(true);
      setAirtableError("");
      try {
        const response = await fetch("/api/airtable/schema", {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          bases?: AirtableBaseOption[];
          defaultBaseId?: string;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not load Airtable bases.");
        }
        const bases = data.bases || [];
        setAirtableBases(bases);
        setForm((current) => ({
          ...current,
          baseId:
            current.baseId ||
            data.defaultBaseId ||
            bases[0]?.id ||
            "",
        }));
      } catch (caught) {
        if (controller.signal.aborted) return;
        setAirtableError(
          caught instanceof Error
            ? caught.message
            : "Could not load Airtable bases.",
        );
      } finally {
        if (!controller.signal.aborted) setLoadingBases(false);
      }
    }
    void loadBases();
    return () => controller.abort();
  }, [editingImage, editorOpen]);

  useEffect(() => {
    if (!editorOpen || editingImage || !form.baseId) return;

    const controller = new AbortController();
    async function loadTables() {
      setLoadingTables(true);
      setAirtableError("");
      try {
        const response = await fetch(
          `/api/airtable/schema?baseId=${encodeURIComponent(form.baseId)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as {
          tables?: AirtableTableOption[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not load Airtable tables.");
        }
        setAirtableTables(data.tables || []);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setAirtableTables([]);
        setAirtableError(
          caught instanceof Error
            ? caught.message
            : "Could not load Airtable tables.",
        );
      } finally {
        if (!controller.signal.aborted) setLoadingTables(false);
      }
    }
    void loadTables();
    return () => controller.abort();
  }, [editingImage, editorOpen, form.baseId]);

  useEffect(() => {
    if (!editorOpen || !isLumaEventUrl(form.imageUrl)) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setResolvingImage(true);
      setImageError("");
      try {
        const response = await fetch("/api/hackathons/luma-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: form.imageUrl }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          imageUrl?: string;
          squareImageUrl?: string;
          error?: string;
        };
        if (!response.ok || !data.imageUrl || !data.squareImageUrl) {
          throw new Error(data.error || "Could not find the Luma event image.");
        }
        setForm((current) => ({
          ...current,
          imageUrl: data.imageUrl || "",
          squareImageUrl: data.squareImageUrl || "",
        }));
      } catch (caught) {
        if (controller.signal.aborted) return;
        setImageError(
          caught instanceof Error
            ? caught.message
            : "Could not find the Luma event image.",
        );
      } finally {
        if (!controller.signal.aborted) setResolvingImage(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [editorOpen, form.imageUrl]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setEditingImage(false);
    setImageError("");
    setAirtableError("");
    setEditorOpen(true);
    setError("");
  }

  function openEdit(hackathon: HackathonConfig, imageOnly = false) {
    setEditing(hackathon.legacy ? null : hackathon);
    setForm({
      name: hackathon.name,
      slug: hackathon.slug,
      baseId: hackathon.baseId,
      tableName: hackathon.tableName,
      imageUrl: hackathon.imageUrl,
      squareImageUrl: hackathon.squareImageUrl,
    });
    setEditingImage(imageOnly);
    setImageError("");
    setAirtableError("");
    setEditorOpen(true);
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/hackathons", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          ...form,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setEditing(null);
      setForm(emptyForm);
      setEditorOpen(false);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The hackathon could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!name || loading) return <LoadingScreen />;
  const imageIsLuma = isLumaEventUrl(form.imageUrl);
  const hasPreviewImage = Boolean(form.imageUrl && !imageIsLuma);

  return (
    <AppShell name={name} role="admin">
      <main className="workspace-main hackathons-main">
        <section className="page-heading">
          <div>
            <span className="eyebrow">Admin workspace</span>
            <h1>Hackathons</h1>
            <p>
              Select an event to manage or create a new path-based judging
              workspace.
            </p>
          </div>
          <button className="primary-button" onClick={openCreate} type="button">
            New hackathon <span aria-hidden>+</span>
          </button>
        </section>

        {error && <div className="error-banner page-error">{error}</div>}

        <section className="hackathon-grid" aria-label="Available hackathons">
          {hackathons.map((hackathon) => (
            <article className="hackathon-card card" key={hackathon.id}>
              <div
                className={`hackathon-card-image${
                  hackathon.imageUrl ? "" : " fallback"
                }`}
                style={
                  hackathon.imageUrl
                    ? { backgroundImage: `url("${hackathon.imageUrl}")` }
                    : undefined
                }
              >
                {!hackathon.imageUrl && (
                  <span className="hackathon-card-initial">
                    {hackathon.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="hackathon-card-body">
                <h2>{hackathon.name}</h2>
                <button
                  aria-label={
                    hackathon.imageUrl
                      ? `Change ${hackathon.name} picture`
                      : `Add a picture for ${hackathon.name}`
                  }
                  className="hackathon-image-edit"
                  onClick={() => openEdit(hackathon)}
                  type="button"
                >
                  <svg
                    aria-hidden
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="m15.2 5.2 3.6 3.6M4 20l4.25-.95L19.3 8a2.55 2.55 0 0 0-3.6-3.6L4.65 15.45 4 20Z"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </button>
              </div>
              <a
                aria-label={`Open ${hackathon.name} dashboard`}
                className="hackathon-card-link"
                href={`/${hackathon.slug}/dashboard`}
              />
            </article>
          ))}
        </section>
      </main>

      {editorOpen && (
        <div
          aria-labelledby="hackathon-editor-title"
          aria-modal="true"
          className="hackathon-editor-modal"
          onMouseDown={closeEditor}
          role="dialog"
        >
          <section
            className="hackathon-editor-dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="hackathon-editor-header">
              <div>
                <span className="eyebrow">
                  {editingImage
                    ? "Event picture"
                    : editing
                      ? "Edit hackathon"
                      : "New hackathon"}
                </span>
                <h2 id="hackathon-editor-title">
                  {editing ? editing.name : "Create an event"}
                </h2>
              </div>
              <button
                aria-label="Close hackathon editor"
                className="hackathon-editor-close"
                disabled={saving}
                onClick={closeEditor}
                type="button"
              >
                ×
              </button>
            </header>

            <form onSubmit={save}>
              <div className="hackathon-editor-preview">
                <div
                  aria-label="Hackathon artwork preview"
                  className={`hackathon-image-preview${
                    hasPreviewImage ? "" : " fallback"
                  }`}
                  role="img"
                  style={
                    hasPreviewImage
                      ? { backgroundImage: `url("${form.imageUrl}")` }
                      : undefined
                  }
                >
                  {resolvingImage ? (
                    <span className="hackathon-image-loading" aria-live="polite">
                      Finding image…
                    </span>
                  ) : !hasPreviewImage ? (
                    <span>
                      {(form.name || "New event").slice(0, 1).toUpperCase()}
                    </span>
                  ) : null}
                </div>
                <p>{resolvingImage ? "Loading from Luma" : "Preview"}</p>
              </div>

              <div className="hackathon-editor-fields">
                {!editingImage && (
                  <label className="field">
                    <span>Hackathon name</span>
                    <input
                      autoFocus
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Night Hack IV"
                      required
                      value={form.name}
                    />
                  </label>
                )}
                <label className="field hackathon-image-field">
                  <span>
                    Image or Luma URL <small>Optional</small>
                  </span>
                  <input
                    autoFocus={editingImage}
                    inputMode="url"
                    onChange={(event) =>
                      {
                        setImageError("");
                        setForm((current) => ({
                          ...current,
                          imageUrl: event.target.value,
                          squareImageUrl: "",
                        }));
                      }
                    }
                    placeholder="https://luma.com/your-event"
                    type="url"
                    value={form.imageUrl}
                  />
                  <small
                    className={`field-hint${imageError ? " error" : ""}`}
                    role={imageError ? "alert" : undefined}
                  >
                    {imageError ||
                      (resolvingImage
                        ? "Getting the event artwork from Luma…"
                        : "Paste a Luma event link or a direct image link.")}
                  </small>
                </label>

                {!editingImage && (
                  <div className="hackathon-workspace-settings">
                    <div>
                      <strong>Workspace settings</strong>
                      <span>Where this event lives and reads submissions.</span>
                    </div>
                    <div className="hackathon-workspace-fields">
                      <label className="field">
                        <span>URL slug</span>
                        <input
                          autoCapitalize="none"
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              slug: event.target.value,
                            }))
                          }
                          placeholder="nighthack4"
                          required
                          value={form.slug}
                        />
                      </label>
                      <label className="field">
                        <span>Airtable base</span>
                        <select
                          disabled={loadingBases}
                          onChange={(event) => {
                            setAirtableTables([]);
                            setForm((current) => ({
                              ...current,
                              baseId: event.target.value,
                              tableName: "",
                            }));
                          }}
                          required
                          value={form.baseId}
                        >
                          <option value="">
                            {loadingBases ? "Loading bases…" : "Select a base"}
                          </option>
                          {airtableBases.map((base) => (
                            <option key={base.id} value={base.id}>
                              {base.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field hackathon-table-field">
                        <span>Airtable table</span>
                        <select
                          disabled={!form.baseId || loadingTables}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              tableName: event.target.value,
                            }))
                          }
                          required
                          value={form.tableName}
                        >
                          <option value="">
                            {loadingTables
                              ? "Loading tables…"
                              : "Select a table"}
                          </option>
                          {airtableTables.map((table) => (
                            <option key={table.id} value={table.name}>
                              {table.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {airtableError && (
                        <small
                          className="field-hint error hackathon-airtable-error"
                          role="alert"
                        >
                          {airtableError}
                        </small>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <footer className="hackathon-editor-actions">
                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={closeEditor}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={
                    saving ||
                    resolvingImage ||
                    imageIsLuma ||
                    (!editingImage &&
                      (loadingBases ||
                        loadingTables ||
                        !form.baseId ||
                        !form.tableName))
                  }
                  type="submit"
                >
                  {saving
                    ? "Saving…"
                    : editingImage
                      ? "Save picture"
                      : editing
                        ? "Save changes"
                        : "Create event"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </AppShell>
  );
}
