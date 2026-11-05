"use client";
import { useEffect, useState, useRef, type FormEvent } from "react";
import type { Submission } from "@/domain/submission";
const empty = {
  projectName: "",
  teamName: "",
  submitterNames: "",
  contactEmail: "",
  track: "",
  toolsUsed: "",
  oneLiner: "",
  description: "",
  progressOutline: "",
  demoUrl: "",
  demoVideoUrl: "",
  repositoryUrl: "",
  previewImageUrl: "",
  teamPhotoUrl: "",
};
export function SubmissionForm({
  slug,
  name,
  open,
  id = "",
}: {
  slug: string;
  name: string;
  open: boolean;
  id?: string;
}) {
  const requestToken = useRef("");
  const [form, setForm] = useState(empty),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!!id);
  useEffect(() => {
    const edit = id;
    if (!edit) return;
    fetch(`/api/hackathons/${slug}/submission?id=${encodeURIComponent(edit)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const s = d.submission as Submission;
        setForm({
          ...empty,
          ...Object.fromEntries(
            Object.keys(empty).map((key) => [
              key,
              key === "toolsUsed"
                ? (s.toolsUsed || []).join(", ")
                : s[key as keyof Submission] || "",
            ]),
          ),
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug, id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/hackathons/${slug}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          requestId: (requestToken.current ||= crypto.randomUUID()),
          ...(id ? { id } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace-main" style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}>
      <header className="page-heading">
        <div>
          <span className="brand-wordmark">
            Hack<span>Buddy</span>
          </span>
          <h1>{name}</h1>
          <p>{id ? "Edit project submission" : "Submit your project"}</p>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {saved ? (
        <section className="card" style={{ padding: 24 }}>
          <h2>{id ? "Project updated" : "Submission received"}</h2>
          <p>
            {id ? "Your changes are saved." : "Your team’s project is ready for the judging queue."}
          </p>
          {id && (
            <a className="secondary-button" href={`/${slug}/projects`}>
              Back to projects
            </a>
          )}
        </section>
      ) : loading ? (
        <p>Loading…</p>
      ) : !open && !id ? (
        <section className="card" style={{ padding: 24 }}>
          <h2>Submissions are closed</h2>
        </section>
      ) : (
        <form onSubmit={submit} className="card" style={{ padding: 24, display: "grid", gap: 16 }}>
          {(
            [
              ["projectName", "Project name"],
              ["teamName", "Team name"],
              ["submitterNames", "Builders"],
              ["contactEmail", "Contact email"],
              ["oneLiner", "One-line description"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                required={key !== "oneLiner"}
                type={key === "contactEmail" ? "email" : "text"}
                maxLength={
                  key === "projectName" || key === "teamName" ? 120 : key === "oneLiner" ? 300 : 500
                }
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="field">
            <span>What did you build?</span>
            <textarea
              required
              rows={4}
              maxLength={10000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="hackathon-workspace-fields">
            <label className="field">
              <span>
                Tools used <small>Comma-separated</small>
              </span>
              <input
                value={form.toolsUsed}
                onChange={(e) => setForm({ ...form, toolsUsed: e.target.value })}
              />
            </label>
            <label className="field">
              <span>
                Track <small>Optional</small>
              </span>
              <input
                value={form.track}
                onChange={(e) => setForm({ ...form, track: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span>
              Demo video URL <small>Optional</small>
            </span>
            <input
              type="url"
              value={form.demoVideoUrl}
              onChange={(e) => setForm({ ...form, demoVideoUrl: e.target.value })}
            />
          </label>
          <details>
            <summary>More project details</summary>
            <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
              {(
                [
                  ["demoUrl", "Live demo URL"],
                  ["repositoryUrl", "Repository URL"],
                  ["previewImageUrl", "Project image URL"],
                  ["teamPhotoUrl", "Team photo URL"],
                ] as const
              ).map(([key, label]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <input
                    type="url"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="field">
                <span>Progress during the hackathon</span>
                <textarea
                  value={form.progressOutline}
                  onChange={(e) => setForm({ ...form, progressOutline: e.target.value })}
                />
              </label>
            </div>
          </details>
          <button className="primary-button" disabled={busy}>
            {busy ? "Saving…" : id ? "Save changes" : "Submit project"}
          </button>
          <p className="field-hint">Contact email is only visible to organizers.</p>
        </form>
      )}
    </main>
  );
}
