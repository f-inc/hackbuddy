"use client";
import { useEffect, useState, useRef, type FormEvent } from "react";
import type { Submission } from "@/domain/submission";
import { useEventSettings } from "@/components/EventConfig";
import {
  MAKERMODS_FORM,
  MAKERMODS_TRACK,
  MAKERMODS_HILL_TRACK,
  MAKERMODS_TRACKS,
  MAKERMODS_TOOLS,
  SUBMISSION_REQUEST_ID,
  SUBMISSION_EDIT_TOKEN,
} from "@/domain/submission-form";

const empty = {
  teamNumber: "",
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
type Fields = typeof empty;
type Draft = {
  form: Fields;
  requestId: string;
  pending: boolean;
  receipt: string;
  editToken?: string;
};
function readFields(value: unknown): Fields {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.keys(empty).map((key) => [
      key,
      typeof source[key] === "string" ? source[key].slice(0, 10000) : "",
    ]),
  ) as Fields;
}

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
  const makerMods = useEventSettings().submissionForm === MAKERMODS_FORM;
  const draftKey = `hackbuddy:submission:v1:${slug}`;
  const requestToken = useRef("");
  const editToken = useRef("");
  const [privateToken, setPrivateToken] = useState("");
  const submitting = useRef(false);
  const [form, setForm] = useState(empty),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(true),
    [loadFailed, setLoadFailed] = useState(false),
    [draftMessage, setDraftMessage] = useState("");
  const selectedTrack = form.track || MAKERMODS_TRACK;
  const hillClimb = makerMods && selectedTrack === MAKERMODS_HILL_TRACK;
  function persist(fields: Fields, uncertain = pending, received = receipt) {
    try {
      localStorage.setItem(
        id ? `${draftKey}:draft:${id}` : draftKey,
        JSON.stringify({
          form: fields,
          requestId: requestToken.current,
          pending: uncertain,
          receipt: received,
          editToken: editToken.current,
        } satisfies Draft),
      );
      setDraftMessage("Draft saved on this device.");
    } catch {
      setDraftMessage(
        "This browser cannot save your draft. Keep this page open until submission is confirmed.",
      );
    }
  }
  function update(key: keyof Fields, value: string) {
    const next = { ...form, [key]: value };
    setForm(next);
    persist(next);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!id) {
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            const draft = JSON.parse(raw) as Partial<Draft>;
            if (active) {
              setForm(readFields(draft.form));
              if (
                typeof draft.editToken === "string" &&
                SUBMISSION_EDIT_TOKEN.test(draft.editToken)
              ) {
                editToken.current = draft.editToken;
                setPrivateToken(draft.editToken);
              }
              if (
                typeof draft.requestId === "string" &&
                SUBMISSION_REQUEST_ID.test(draft.requestId)
              ) {
                requestToken.current = draft.requestId;
                setPending(draft.pending === true);
                if (draft.receipt === draft.requestId)
                  setReceipt(draft.receipt);
              }
              setDraftMessage("Your saved draft was restored on this device.");
            }
          }
        } catch {
          /* An unavailable or invalid local draft does not block submission. */
        }
        if (active) setLoading(false);
        return;
      }
      try {
        const fragmentToken =
          new URLSearchParams(window.location.hash.slice(1)).get("edit") || "";
        if (SUBMISSION_EDIT_TOKEN.test(fragmentToken)) {
          editToken.current = fragmentToken;
          setPrivateToken(fragmentToken);
          // The fragment stays out of server logs and referrer headers.
          try {
            localStorage.setItem(`${draftKey}:edit:${id}`, fragmentToken);
          } catch {}
        } else {
          try {
            editToken.current =
              localStorage.getItem(`${draftKey}:edit:${id}`) || "";
          } catch {}
          setPrivateToken(editToken.current);
        }
        const participant = SUBMISSION_EDIT_TOKEN.test(editToken.current);
        const response = await fetch(
          participant
            ? `/api/hackathons/${slug}/projects/edit?id=${encodeURIComponent(id)}`
            : `/api/hackathons/${slug}/submission?id=${encodeURIComponent(id)}`,
          {
            signal: AbortSignal.timeout(20000),
            cache: "no-store",
            ...(participant
              ? { headers: { Authorization: `Bearer ${editToken.current}` } }
              : {}),
          },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Project could not be loaded.");
        const submission = data.submission as Submission;
        if (active) {
          setForm(
            readFields({
              ...submission,
              toolsUsed: (submission.toolsUsed || []).join(", "),
            }),
          );
          // Recover unfinished edits separately from the original submission receipt.
          if (participant) {
            try {
              const draft = JSON.parse(
                localStorage.getItem(`${draftKey}:draft:${id}`) || "null",
              ) as Draft | null;
              if (
                draft &&
                draft.editToken === editToken.current &&
                !draft.receipt
              ) {
                setForm(readFields(draft.form));
                setPending(draft.pending === true);
                if (SUBMISSION_REQUEST_ID.test(draft.requestId))
                  requestToken.current = draft.requestId;
                setDraftMessage(
                  "Your unfinished edits were restored on this device.",
                );
              }
            } catch {
              // The saved server answers remain available without browser storage.
            }
          }
        }
      } catch (cause) {
        if (active) {
          setError((cause as Error).message);
          setLoadFailed(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug, id, draftKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    requestToken.current ||= crypto.randomUUID();
    if (!id && !editToken.current) {
      editToken.current = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      setPrivateToken(editToken.current);
    }
    persist(form, true, "");
    setPending(true);
    try {
      const response = await fetch(`/api/hackathons/${slug}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          ...form,
          ...(makerMods ? { track: selectedTrack } : {}),
          requestId: requestToken.current,
          ...(editToken.current ? { editToken: editToken.current } : {}),
          ...(id ? { id } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          setPending(false);
          persist(form, false, "");
        }
        throw new Error(data.error || "Submission could not be saved.");
      }
      if (typeof data.id !== "string" || !data.id)
        throw new Error("No submission receipt was returned.");
      setReceipt(data.id);
      setPending(false);
      persist(form, false, data.id);
      if (editToken.current) {
        try {
          localStorage.setItem(
            `${draftKey}:edit:${data.id}`,
            editToken.current,
          );
        } catch {}
      }
    } catch (cause) {
      const message = (cause as Error).message;
      setError(
        message === "Failed to fetch" ||
          (cause as Error).name === "TimeoutError"
          ? "We could not confirm receipt. Retry submission to safely check the same answers without creating a duplicate."
          : message,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const tools = form.toolsUsed
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
  const otherTools = form.toolsUsed
    .split(",")
    .filter((tool) => !MAKERMODS_TOOLS.some((option) => option === tool.trim()))
    .join(",")
    .replace(/^ /, "");
  return (
    <main
      className="workspace-main"
      style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}
    >
      <header className="page-heading">
        <div>
          <span className="brand-wordmark">
            Hack<span>Buddy</span>
          </span>
          <h1>{name}</h1>
          <p>{id ? "Edit project submission" : "Submit your project"}</p>
          {makerMods && (
            <p>
              November 7–8, 2026 · Founders Inc., San Francisco ·{" "}
              <a href="https://luma.com/pah" target="_blank" rel="noreferrer">
                Event details
              </a>
            </p>
          )}
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {receipt ? (
        <section className="card" style={{ padding: 24 }} role="status">
          <h2>{id ? "Project updated" : "Submission received"}</h2>
          <p>
            {id
              ? "Your changes are saved."
              : "Your team’s project has been saved for the organizers."}
          </p>
          <p>
            Submission reference: <strong>{receipt}</strong>
          </p>
          <p>
            Team: {form.teamName} · Project: {form.projectName}
          </p>
          {privateToken && (
            <div>
              <p>
                Keep this private edit link to reopen your saved answers on any
                device. Anyone with the link can edit until submissions close.
              </p>
              {id ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setReceipt("")}
                >
                  Edit submission
                </button>
              ) : (
                <a
                  className="primary-button"
                  href={`/${slug}/submit?id=${encodeURIComponent(receipt)}#edit=${privateToken}`}
                >
                  Edit submission
                </a>
              )}
              <label className="field" style={{ marginTop: 16 }}>
                <span>Private edit link (copy and save)</span>
                <input
                  readOnly
                  aria-label="Private edit link"
                  value={
                    typeof window === "undefined"
                      ? ""
                      : `${window.location.origin}/${slug}/submit?id=${encodeURIComponent(receipt)}#edit=${privateToken}`
                  }
                  onFocus={(e) => e.target.select()}
                />
              </label>
            </div>
          )}
          {!privateToken && !id && (
            <p>For changes to this earlier submission, contact an organizer.</p>
          )}
          {id && (
            <a className="secondary-button" href={`/${slug}/projects`}>
              Back to projects
            </a>
          )}
        </section>
      ) : loading ? (
        <p role="status">Loading…</p>
      ) : loadFailed ? (
        <p>The project could not be loaded. Refresh this page to try again.</p>
      ) : !open && !id && !pending ? (
        <section className="card" style={{ padding: 24 }}>
          <h2>Submissions are closed</h2>
        </section>
      ) : (
        <form
          onSubmit={submit}
          className="card"
          style={{ padding: 24, display: "grid", gap: 16 }}
        >
          <p className="field-hint">
            Required fields are marked *. Contact email is only visible to
            organizers.
          </p>
          {pending && !busy && (
            <p role="status">
              Receipt is not yet confirmed. Retry below with the same answers.
              This avoids duplicate submissions.
            </p>
          )}
          <fieldset
            disabled={busy || pending}
            style={{
              border: 0,
              padding: 0,
              margin: 0,
              minWidth: 0,
              display: "grid",
              gap: 16,
            }}
          >
            <label className="field">
              <span>
                Team number {makerMods ? "*" : <small>Optional</small>}
              </span>
              <input
                name="teamNumber"
                required={makerMods}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{1,10}"
                maxLength={10}
                autoComplete="off"
                value={form.teamNumber}
                onChange={(e) => update("teamNumber", e.target.value)}
              />
            </label>
            {makerMods && (
              <label className="field">
                <span>Track *</span>
                <select
                  name="track"
                  required
                  value={selectedTrack}
                  onChange={(e) => update("track", e.target.value)}
                >
                  {MAKERMODS_TRACKS.map((track) => (
                    <option key={track}>{track}</option>
                  ))}
                </select>
                {hillClimb && (
                  <small>
                    Hill Climb is evaluated in person. No demo video is needed.
                  </small>
                )}
              </label>
            )}
            {(
              [
                ["projectName", "Project name"],
                ["teamName", "Team name"],
                ["submitterNames", "First name(s) of all builders"],
                ["contactEmail", "Contact email"],
                ["oneLiner", "One-line description"],
              ] as const
            )
              .filter(([key]) => !hillClimb || key !== "oneLiner")
              .map(([key, label]) => (
                <label className="field" key={key}>
                  <span>
                    {label}
                    {key !== "oneLiner" || makerMods ? " *" : " (optional)"}
                  </span>
                  <input
                    name={key}
                    required={key !== "oneLiner" || makerMods}
                    type={key === "contactEmail" ? "email" : "text"}
                    autoComplete={key === "contactEmail" ? "email" : "off"}
                    maxLength={
                      key === "projectName" || key === "teamName"
                        ? 120
                        : key === "oneLiner"
                          ? makerMods
                            ? 50
                            : 300
                          : key === "contactEmail"
                            ? 254
                            : 500
                    }
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                  />
                  {key === "oneLiner" && makerMods && (
                    <small>50 characters maximum.</small>
                  )}
                </label>
              ))}
            <label className="field">
              <span>
                {hillClimb
                  ? "What did you do to improve the base model? *"
                  : "What did you build? *"}
              </span>
              <textarea
                name="description"
                required
                rows={4}
                maxLength={10000}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
              {hillClimb && (
                <small>
                  For example: how many episodes you collected, how many
                  training steps you ran, and any changes you made to the data
                  or training setup.
                </small>
              )}
            </label>
            {!hillClimb && (
              <label className="field">
                <span>
                  Progress during the hackathon
                  {makerMods ? " *" : " (optional)"}
                </span>
                <textarea
                  name="progressOutline"
                  required={makerMods}
                  rows={4}
                  maxLength={5000}
                  placeholder="In 3–5 points, outline what you built, integrated, tested, or improved during the hackathon."
                  value={form.progressOutline}
                  onChange={(e) => update("progressOutline", e.target.value)}
                />
              </label>
            )}
            {!makerMods && (
              <label className="field">
                <span>Track (optional)</span>
                <input
                  name="track"
                  maxLength={100}
                  value={form.track}
                  onChange={(e) => update("track", e.target.value)}
                />
              </label>
            )}
            {makerMods ? (
              <fieldset
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <legend>Tools used (select all that apply)</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
                  {MAKERMODS_TOOLS.map((tool) => (
                    <label
                      key={tool}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <input
                        type="checkbox"
                        name="toolsUsed"
                        value={tool}
                        checked={tools.includes(tool)}
                        onChange={(e) =>
                          update(
                            "toolsUsed",
                            (e.target.checked
                              ? [...tools, tool]
                              : tools.filter((t) => t !== tool)
                            ).join(", "),
                          )
                        }
                      />
                      {tool}
                    </label>
                  ))}
                </div>
                <label className="field" style={{ marginTop: 12 }}>
                  <span>Other tools (optional, comma-separated)</span>
                  <input
                    name="otherTools"
                    maxLength={700}
                    value={otherTools}
                    onChange={(e) =>
                      update(
                        "toolsUsed",
                        [
                          ...MAKERMODS_TOOLS.filter((tool) =>
                            tools.includes(tool),
                          ),
                          e.target.value,
                        ]
                          .filter(Boolean)
                          .join(", "),
                      )
                    }
                  />
                </label>
              </fieldset>
            ) : (
              <label className="field">
                <span>Tools used (comma-separated, optional)</span>
                <input
                  name="toolsUsed"
                  maxLength={1000}
                  value={form.toolsUsed}
                  onChange={(e) => update("toolsUsed", e.target.value)}
                />
              </label>
            )}
            {!hillClimb && (
              <label className="field">
                <span>
                  60-second demo video link
                  {makerMods ? " *" : " (optional)"}
                </span>
                <input
                  name="demoVideoUrl"
                  type="url"
                  maxLength={2000}
                  required={makerMods}
                  value={form.demoVideoUrl}
                  onChange={(e) => update("demoVideoUrl", e.target.value)}
                />
                <small>
                  Upload your video to YouTube, set it to Public or Unlisted,
                  and paste the link. Keep it to 60 seconds and make sure judges
                  can watch without requesting access.
                </small>
              </label>
            )}
            {!hillClimb && (
              <label className="field">
                <span>Live project / website link (optional)</span>
                <input
                  name="demoUrl"
                  type="url"
                  maxLength={2000}
                  value={form.demoUrl}
                  onChange={(e) => update("demoUrl", e.target.value)}
                />
                <small>
                  For a physical project, you may link a short demonstration of
                  your robot in action.
                </small>
              </label>
            )}
            <label className="field">
              <span>Team photo link (optional)</span>
              <input
                name="teamPhotoUrl"
                type="url"
                maxLength={2000}
                value={form.teamPhotoUrl}
                onChange={(e) => update("teamPhotoUrl", e.target.value)}
              />
              <small>
                Paste a direct image link that organizers can open without
                requesting access.
              </small>
            </label>
            <label className="field">
              <span>
                GitHub repository link
                {makerMods ? " *" : " (optional, preferred)"}
              </span>
              <input
                name="repositoryUrl"
                type="url"
                required={makerMods}
                maxLength={2000}
                value={form.repositoryUrl}
                onChange={(e) => update("repositoryUrl", e.target.value)}
              />
            </label>
            {!hillClimb && (
              <details>
                <summary>Project image (optional)</summary>
                <label className="field" style={{ marginTop: 12 }}>
                  <span>Project image URL</span>
                  <input
                    name="previewImageUrl"
                    type="url"
                    maxLength={2000}
                    value={form.previewImageUrl}
                    onChange={(e) => update("previewImageUrl", e.target.value)}
                  />
                </label>
              </details>
            )}
          </fieldset>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy
              ? "Saving…"
              : pending
                ? "Retry submission"
                : id
                  ? "Save changes"
                  : "Submit project"}
          </button>
          <p className="field-hint" role="status">
            {draftMessage || "Your draft stays on this device until you save."}
          </p>
        </form>
      )}
    </main>
  );
}
