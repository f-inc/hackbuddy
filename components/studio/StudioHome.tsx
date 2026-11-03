"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  defaultRules,
  type Event,
  type StudioActor,
  type Workspace,
} from "@/domain/studio/model";
import { api, ErrorMessage, Field, formats, Frame, Empty } from "./shared";
import { WorkspaceTeam } from "./WorkspaceTeam";
import { JudgingPreview } from "./JudgingPreview";
type Home = {
  events: (Omit<Event, "judgePassword"> & {
    projectCount: number;
    judgeCount: number;
  })[];
  actor: StudioActor;
  workspace: Workspace;
};
export function StudioHome() {
  const router = useRouter();
  const [teamOpen, setTeamOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(4);
  useEffect(() => {
    const compact = window.matchMedia(
      "(min-width: 901px) and (max-height: 639px)",
    );
    const resize = () => setPageSize(compact.matches ? 2 : 4);
    resize();
    compact.addEventListener("change", resize);
    return () => compact.removeEventListener("change", resize);
  }, []);
  const [query, setQuery] = useState("");
  const [home, setHome] = useState<Home | null>(null),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState<"login" | "signup" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false),
    [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [format] = useState<Event["rules"]["template"]>("ranked-final"),
    [password, setPassword] = useState("");
  useEffect(() => {
    api<Home>("events")
      .then(setHome)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function demo() {
    setBusy(true);
    setError("");
    try {
      const v = await api<{ eventId: string }>("session", { action: "demo" });
      router.push(`/studio/${v.eventId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function auth(form: FormData) {
    setBusy(true);
    setError("");
    try {
      await api("session", {
        action: mode,
        ...Object.fromEntries(form.entries()),
      });
      setHome(await api<Home>("events"));
      setMode(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createEvent() {
    setBusy(true);
    setError("");
    try {
      const v = await api<{ event: Event }>("events", {
        name,
        description,
        password,
        rules: { ...defaultRules, template: format },
      });
      router.push(`/studio/${v.event.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  if (loading)
    return (
      <Frame>
        <main className="s-container s-loading">Opening your workspace…</main>
      </Frame>
    );
  if (!home)
    return (
      <Frame
        className="s-landing"
        actions={
          <button
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Sign in ↗
          </button>
        }
      >
        <main className="s-container s-landing-main">
          <div className="s-hero">
            <div className="s-hero-copy">
              <span className="s-eyebrow">
                For hackathon organizers & judging teams
              </span>
              <h1>
                Hackathon judging,
                <br />
                without the chaos.
              </h1>
              <p>
                Bring in team submissions, assign judges, score working demos,
                and announce the finalists—all in one place.
              </p>
              <div className="s-actions">
                <button
                  className="s-inverse"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Set up your hackathon ↗
                </button>
                <button onClick={demo} disabled={busy}>
                  Try a demo hackathon
                </button>
              </div>
              <p className="s-caption">
                No judge accounts to set up. Just a name and hackathon password.
              </p>
            </div>
            <JudgingPreview />
          </div>
          <ErrorMessage message={error} />
        </main>
        {mode && (
          <div className="s-modal-backdrop">
            <section
              className="s-modal"
              role="dialog"
              aria-modal="true"
              aria-label={mode === "signup" ? "Create workspace" : "Sign in"}
            >
              <div className="s-section-heading">
                <h2>
                  {mode === "signup"
                    ? "Set up your hackathon."
                    : "Welcome back."}
                </h2>
                <button onClick={() => setMode(null)} aria-label="Close">
                  ×
                </button>
              </div>
              <p>
                {mode === "signup"
                  ? "Create your organizer workspace, then set up your hackathon."
                  : "Sign in to manage your hackathons."}
              </p>
              <form action={auth} className="s-form">
                {mode === "signup" && (
                  <Field label="Workspace name">
                    <input
                      name="workspace"
                      placeholder="Your club, community, or organization"
                      required
                    />
                  </Field>
                )}
                <Field
                  label="Workspace address"
                  hint="A short name to use when signing in, like community-lab."
                >
                  <input
                    name="slug"
                    placeholder="community-lab"
                    required
                    pattern="[a-z0-9-]+"
                  />
                </Field>
                <Field label="Your name">
                  <input name="name" autoComplete="username" required />
                </Field>
                <Field label="Password">
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    minLength={6}
                    required
                  />
                </Field>
                <ErrorMessage message={error} />
                <button className="s-inverse" disabled={busy}>
                  {busy
                    ? "Opening…"
                    : mode === "signup"
                      ? "Create workspace ↗"
                      : "Sign in ↗"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMode(mode === "signup" ? "login" : "signup")
                  }
                >
                  {mode === "signup"
                    ? "Already have a workspace? Sign in"
                    : "Create a new workspace"}
                </button>
              </form>
            </section>
          </div>
        )}
      </Frame>
    );
  const filtered = home.events.filter((event) =>
    `${event.name} ${event.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / pageSize) - 1),
  );
  return (
    <Frame
      className="s-screen s-home"
      label={home.workspace.name}
      actions={
        <>
          <button onClick={() => setTeamOpen(true)}>Organizers</button>
          <details className="s-account-menu">
            <summary className="s-button">{home.actor.name} ▾</summary>
            <div>
              <button
                onClick={async () => {
                  await api("session", { action: "logout" });
                  setHome(null);
                }}
              >
                Sign out
              </button>
            </div>
          </details>
        </>
      }
    >
      <main className="s-container s-screen-main">
        <div className="s-page-heading">
          <div>
            <h1>Your hackathons</h1>
          </div>
          <button
            className="s-inverse"
            onClick={() => {
              setCreate(true);
              setStep(0);
              setError("");
            }}
          >
            + Create a hackathon
          </button>
        </div>
        {home.actor.demo && (
          <details className="s-inline-help">
            <summary>About this demo workspace</summary>
            <p>
              Explore with sample data. Your changes stay in this workspace.
              Create your own workspace when you’re ready to run a hackathon.
            </p>
          </details>
        )}
        <ErrorMessage message={error} />
        {!home.events.length ? (
          <Empty
            title="Your first hackathon starts here."
            detail="Choose your judging format, import submissions, and invite your panel."
          >
            <button onClick={() => setCreate(true)}>
              Create a hackathon ↗
            </button>
          </Empty>
        ) : (
          <>
            <input
              className="s-search"
              aria-label="Search hackathons"
              placeholder="Find a hackathon…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            <div className="s-screen-body">
              <div className="s-event-grid">
                {filtered
                  .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
                  .map((e) => (
                    <Link
                      href={`/studio/${e.id}`}
                      className="s-event-card"
                      key={e.id}
                    >
                      <div className="s-card-top">
                        <span className={`s-tag s-stage-${e.stage}`}>
                          {e.stage}
                        </span>
                        <span>↗</span>
                      </div>
                      <h2>{e.name}</h2>
                      <p>{e.description || formats[e.rules.template]}</p>
                      <div className="s-event-meta">
                        <span>
                          {e.projectCount}{" "}
                          {e.projectCount === 1 ? "project" : "projects"}
                        </span>
                        <span>
                          {e.judgeCount}{" "}
                          {e.judgeCount === 1 ? "judge" : "judges"}
                        </span>
                        <span>{formats[e.rules.template]}</span>
                      </div>
                    </Link>
                  ))}
              </div>
              {!filtered.length && (
                <p className="s-muted">No matching hackathons.</p>
              )}
            </div>
            {filtered.length > pageSize && (
              <div className="s-pagination">
                <span>
                  Page {currentPage + 1} of{" "}
                  {Math.ceil(filtered.length / pageSize)}
                </span>
                <div className="s-actions">
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    ← Previous
                  </button>
                  <button
                    disabled={(currentPage + 1) * pageSize >= filtered.length}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      {teamOpen && (
        <WorkspaceTeam
          slug={home.workspace.slug}
          close={() => setTeamOpen(false)}
        />
      )}
      {create && (
        <div className="s-modal-backdrop">
          <section
            className="s-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Create hackathon"
          >
            <div className="s-section-heading">
              <span className="s-eyebrow">
                Create a hackathon · {step + 1} of 3
              </span>
              <button onClick={() => setCreate(false)} aria-label="Close">
                ×
              </button>
            </div>
            <h2>
              {
                [
                  "Name your hackathon.",
                  "The HackBuddy judging flow.",
                  "Invite your judging panel.",
                ][step]
              }
            </h2>
            <form
              className="s-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (step < 2) setStep(step + 1);
                else createEvent();
              }}
            >
              {step === 0 && (
                <>
                  <Field label="Hackathon name">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Builders Weekend"
                    />
                  </Field>
                  <Field label="A little about it">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What are we coming together to build?"
                    />
                  </Field>
                </>
              )}
              {step === 1 && (
                <div className="s-creation-flow">
                  <div className="s-flow-steps">
                    <span>First pass judging</span>
                    <span>→ Top 7</span>
                    <span>→ Second pass judging</span>
                    <span>→ Winners</span>
                  </div>
                  <p>
                    Two first-pass reviews per project, followed by a ranked
                    vote for the top three winners. Every stage has a TV
                    presentation.
                  </p>
                  <div className="s-note">
                    Progress · Practicality · Technical Complexity
                    <br />
                    Three criteria, scored 1–10. You can edit the rubric and
                    event settings later.
                  </div>
                </div>
              )}
              {step === 2 && (
                <>
                  <p>
                    Judges use their name and this shared hackathon password.
                    You can restrict access to an invited roster in settings.
                  </p>
                  <Field label="Judge password">
                    <input
                      type="password"
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="At least 6 characters"
                    />
                  </Field>
                  <div className="s-note">
                    Next: import your projects, customize the rubric, and invite
                    judges.
                  </div>
                </>
              )}
              <ErrorMessage message={error} />
              <div className="s-actions">
                {step > 0 && (
                  <button type="button" onClick={() => setStep(step - 1)}>
                    ← Back
                  </button>
                )}
                <button className="s-inverse" disabled={busy}>
                  {busy
                    ? "Creating…"
                    : step < 2
                      ? "Continue →"
                      : "Create hackathon ↗"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Frame>
  );
}
