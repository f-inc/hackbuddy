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
  const [home, setHome] = useState<Home | null>(null),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState<"login" | "signup" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false),
    [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [format, setFormat] = useState<Event["rules"]["template"]>("ranked-final"),
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
        <main className="s-container">
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
          <section className="s-feature-grid">
            {[
              [
                "01",
                "Bring in the teams.",
                "Import team names, project descriptions, demo links, and repositories from your submission sheet.",
              ],
              [
                "02",
                "Give every build a fair shot.",
                "Set your rubric, invite judges, and balance project reviews. Scores and notes save as they go.",
              ],
              [
                "03",
                "Make demo night count.",
                "Present unranked finalists on TV, collect final ballots, and publish the winners for everyone to see.",
              ],
            ].map(([n, title, detail]) => (
              <article key={n}>
                <span className="s-eyebrow">{n}</span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </article>
            ))}
          </section>
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
  return (
    <Frame
      label={home.workspace.name}
      actions={
        <>
          <span className="s-muted">{home.actor.name}</span>
          <button onClick={() => setTeamOpen(true)}>Organizers</button>
          <button
            onClick={async () => {
              await api("session", { action: "logout" });
              setHome(null);
            }}
          >
            Sign out
          </button>
        </>
      }
    >
      <main className="s-container">
        <div className="s-page-heading">
          <div>
            <span className="s-eyebrow">Your hackathons</span>
            <h1>Ready for the next build?</h1>
            <p>
              Set up judging, review projects, and take your finalists to demo
              night.
            </p>
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
          <div className="s-note">
            You’re exploring an isolated sample workspace. Changes here are
            yours to try. Create a workspace to run your own hackathons.
          </div>
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
          <div className="s-event-grid">
            {home.events.map((e) => (
              <Link
                href={`/studio/${e.id}`}
                className="s-event-card"
                key={e.id}
              >
                <div className="s-card-top">
                  <span className={`s-tag s-stage-${e.stage}`}>{e.stage}</span>
                  <span>↗</span>
                </div>
                <div className="s-event-art">✳</div>
                <h2>{e.name}</h2>
                <p>{e.description || formats[e.rules.template]}</p>
                <div className="s-event-meta">
                  <span>
                    {e.projectCount}{" "}
                    {e.projectCount === 1 ? "project" : "projects"}
                  </span>
                  <span>
                    {e.judgeCount} {e.judgeCount === 1 ? "judge" : "judges"}
                  </span>
                  <span>{formats[e.rules.template]}</span>
                </div>
              </Link>
            ))}
          </div>
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
                  "How will judging work?",
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
                <div className="s-format-options">
                  {Object.entries(formats).map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      className={format === key ? "s-selected" : ""}
                      onClick={() => setFormat(key as typeof format)}
                    >
                      <strong>{label}</strong>
                      <span>
                        {key === "single"
                          ? "Score projects against a custom rubric in one judging round."
                          : key === "scored-final"
                            ? "Shortlist projects, then score the finalists."
                            : "Score submissions, then let judges rank their favorite finalists."}
                      </span>
                    </button>
                  ))}
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
