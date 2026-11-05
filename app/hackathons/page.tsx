"use client";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { EventSettingsFields } from "@/components/EventSettingsFields";
import { eventSettings } from "@/domain/event-settings";
import { NEW_EVENT_SCORING_POLICY, type ScoringPolicy } from "@/domain/event-scoring";
import type { HackathonConfig } from "@/lib/hackathons";
import { useEffect, useState, type FormEvent } from "react";
const blank = () => ({
  name: "",
  slug: "",
  imageUrl: "",
  squareImageUrl: "",
  scoringPolicy: NEW_EVENT_SCORING_POLICY as ScoringPolicy,
  settings: eventSettings(),
});
export default function HackathonsPage() {
  const [name, setName] = useState(""),
    [events, setEvents] = useState<HackathonConfig[]>([]),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState<HackathonConfig | null>(null),
    [open, setOpen] = useState(false),
    [form, setForm] = useState(blank),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  async function refresh(response?: Response) {
    const r = response ?? (await fetch("/api/hackathons"));
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setEvents(d.hackathons);
    return d.hackathons as HackathonConfig[];
  }
  function edit(event: HackathonConfig) {
    setEditing(event);
    setForm({
      name: event.name,
      slug: event.slug,
      imageUrl: event.imageUrl,
      squareImageUrl: event.squareImageUrl,
      scoringPolicy: event.scoringPolicy,
      settings: eventSettings(event.settings),
    });
    setError("");
    setOpen(true);
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      const [r, eventResponse] = await Promise.all([
        fetch("/api/auth/session"),
        fetch("/api/hackathons"),
      ]);
      if (!r.ok) {
        window.location.href = "/";
        return;
      }
      const session = await r.json();
      if (session.role !== "admin") {
        window.location.href = session.hackathon ? `/${session.hackathon}/judging` : "/";
        return;
      }
      if (!alive) return;
      setName(session.name);
      const all = await refresh(eventResponse);
      const slug = new URLSearchParams(window.location.search).get("edit");
      const event = all.find((e) => e.slug === slug);
      if (event) edit(event);
    })()
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, saving]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/hackathons", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...(editing
            ? { id: editing.id, baseId: editing.baseId, tableName: editing.tableName }
            : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setOpen(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!name)
    return error ? (
      <main className="workspace-main">
        <div className="error-banner">{error}</div>
      </main>
    ) : (
      <LoadingScreen />
    );
  return (
    <AppShell name={name} role="admin">
      <main className="workspace-main hackathons-main">
        <section className="page-heading">
          <div>
            <span className="eyebrow">Admin workspace</span>
            <h1>Hackathons</h1>
            <p>Select an event or create a hackathon.</p>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setEditing(null);
              setForm(blank());
              setError("");
              setOpen(true);
            }}
          >
            New hackathon +
          </button>
        </section>
        {error && !open && <div className="error-banner">{error}</div>}
        {loading && <p role="status">Loading hackathons…</p>}
        <section className="hackathon-grid" aria-label="Available hackathons" aria-busy={loading}>
          {events.map((event) => (
            <article className="hackathon-card card" key={event.id}>
              <div
                className={`hackathon-card-image${event.imageUrl ? "" : " fallback"}`}
                style={
                  event.imageUrl
                    ? { backgroundImage: `url(${JSON.stringify(event.imageUrl)})` }
                    : undefined
                }
              >
                {!event.imageUrl && <span className="hackathon-card-initial">{event.name[0]}</span>}
              </div>
              <div className="hackathon-card-body">
                <h2>{event.name}</h2>
                <button
                  className="hackathon-image-edit"
                  aria-label={`Edit ${event.name}`}
                  onClick={() => edit(event)}
                >
                  ✎
                </button>
              </div>
              <a
                className="hackathon-card-link"
                aria-label={`Open ${event.name}`}
                href={`/${event.slug}/judging`}
              />
            </article>
          ))}
        </section>
        {!loading && !error && !events.length && (
          <section className="empty-state card">
            <h2>Create your first hackathon</h2>
            <p>Share its submission form, then start judging.</p>
          </section>
        )}
      </main>
      {open && (
        <div
          className="hackathon-editor-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hackathon-editor-title"
          onMouseDown={() => !saving && setOpen(false)}
        >
          <section className="hackathon-editor-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <header className="hackathon-editor-header">
              <h2 id="hackathon-editor-title">{editing ? "Edit hackathon" : "New hackathon"}</h2>
              <button className="secondary-button" disabled={saving} onClick={() => setOpen(false)}>
                Close
              </button>
            </header>
            <form onSubmit={save} className="hackathon-editor-form">
              {error && <div className="error-banner">{error}</div>}
              <label className="field">
                <span>Event name</span>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Event URL</span>
                <input
                  value={form.slug}
                  disabled={!!editing}
                  placeholder="Generated from the event name"
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  Event image URL <small>Optional</small>
                </span>
                <input
                  type="text"
                  inputMode="url"
                  value={form.imageUrl}
                  onChange={(e) =>
                    setForm({ ...form, imageUrl: e.target.value, squareImageUrl: "" })
                  }
                />
              </label>
              {editing?.storage !== "database" && editing ? (
                <p>Historical Airtable event. Its original judging rules remain unchanged.</p>
              ) : (
                <>
                  <EventSettingsFields
                    value={form.settings}
                    onChange={(settings) => setForm({ ...form, settings })}
                  />
                  <details>
                    <summary>Scoring method</summary>
                    <label className="field">
                      <span>Method</span>
                      <select
                        value={form.scoringPolicy}
                        onChange={(e) =>
                          setForm({ ...form, scoringPolicy: e.target.value as ScoringPolicy })
                        }
                      >
                        <option value="normalized-v1">Judge-normalized scores</option>
                        <option value="raw-v1">Raw scores</option>
                      </select>
                    </label>
                  </details>
                </>
              )}
              {editing?.storage === "database" && (
                <p className="field-hint">
                  Submission form: <a href={`/${editing.slug}/submit`}>/{editing.slug}/submit</a> ·
                  Judge sign-in: <a href={`/${editing.slug}`}>/{editing.slug}</a>. Judging rules
                  lock after the first review session starts.
                </p>
              )}
              <footer className="hackathon-editor-footer">
                <button className="primary-button" disabled={saving}>
                  {saving ? "Saving…" : "Save hackathon"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </AppShell>
  );
}
