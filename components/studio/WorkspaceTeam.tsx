"use client";
import { useEffect, useState } from "react";
import { api, ErrorMessage, Field } from "./shared";
type Team = {
  owner: boolean;
  members: { id: string; name: string; active: boolean; owner: boolean }[];
};
export function WorkspaceTeam({
  slug,
  close,
}: {
  slug: string;
  close: () => void;
}) {
  const [data, setData] = useState<Team | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Team>("team")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function update(input: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      setData(await api<Team>("team", input));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="s-modal-backdrop">
      <section
        className="s-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Workspace organizers"
      >
        <div className="s-section-heading">
          <h2>A shared effort.</h2>
          <button onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <p>
          Organizers can manage every event in <strong>{slug}</strong>. The
          owner manages organizer access.
        </p>
        <ErrorMessage message={error} />
        {data?.members.map((m) => (
          <div className="s-team-row" key={m.id}>
            <div>
              <strong>{m.name}</strong>
              <small>
                {m.owner ? "Owner" : m.active ? "Organizer" : "Access revoked"}
              </small>
            </div>
            {data.owner && !m.owner && (
              <button
                disabled={busy}
                onClick={() => update({ id: m.id, active: !m.active })}
              >
                {m.active ? "Revoke" : "Restore"}
              </button>
            )}
          </div>
        ))}
        {data?.owner && (
          <form
            className="s-form"
            action={async (form) => {
              await update(Object.fromEntries(form));
            }}
          >
            <h3>Invite an organizer.</h3>
            <Field label="Name">
              <input name="name" required />
            </Field>
            <Field
              label="Initial password"
              hint="Share the workspace address, their name, and this password directly."
            >
              <input
                name="password"
                type="password"
                minLength={6}
                required
                autoComplete="new-password"
              />
            </Field>
            <button className="s-inverse" disabled={busy}>
              Add organizer ↗
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
