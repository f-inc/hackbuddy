"use client";

import "./final-voting.css";
import { useState } from "react";
import type { FinalsState } from "@/lib/types";

type Props = {
  finals: FinalsState;
  admin: boolean;
  apiBase: string;
  onInspect: (id: string) => void;
  onUpdate: (state: FinalsState) => void;
};
const places = ["1st", "2nd", "3rd"];

export function FinalVotingPanel({
  finals,
  admin,
  apiBase,
  onInspect,
  onUpdate,
}: Props) {
  const [picks, setPicks] = useState<string[]>(
    finals.ownBallot?.picks ?? ["", "", ""],
  );
  const [winners, setWinners] = useState<string[]>(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savedPicks = finals.ownBallot?.picks ?? ["", "", ""];
  const dirty = picks.some((id, index) => id !== savedPicks[index]);
  const complete = picks.every(Boolean) && new Set(picks).size === 3;
  const override = winners.some(Boolean);
  const validOverride = winners.every(Boolean) && new Set(winners).size === 3;

  function choose(id: string, place: number) {
    setPicks((current) => {
      const next = [...current];
      const oldPlace = next.indexOf(id);
      if (oldPlace === place) next[place] = "";
      else {
        if (oldPlace >= 0) next[oldPlace] = next[place];
        next[place] = id;
      }
      return next;
    });
  }

  async function save(publish: boolean) {
    if (
      publish &&
      !window.confirm(
        "Publish and lock this final podium? Judges will no longer be able to revise their ballots.",
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/finals`, {
        method: publish ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          publish
            ? { action: "publish", ...(override ? { winnerIds: winners } : {}) }
            : { picks },
        ),
      });
      const data = (await response.json()) as {
        finals: FinalsState;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Could not save your changes.");
      onUpdate(data.finals);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save your changes.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="podium-voting" aria-label="Final round voting">
      <header className="podium-voting-header">
        <h2>
          {finals.eligibleJudge ? "Your final ballot" : "Finalist submissions"}
        </h2>
        <p>
          {finals.eligibleJudge
            ? "Choose first, second, and third on the cards. Submit all three together; you can revise until results are published."
            : "Open any card to review the full submission."}
        </p>
        {finals.eligibleJudge && (
          <p role="status">
            {finals.ownBallot
              ? `Ballot submitted ${new Date(finals.ownBallot.submittedAt).toLocaleTimeString()}.`
              : "Your ballot has not been submitted."}
            {dirty &&
              " Changes are unsaved; only your last submitted ballot counts."}
          </p>
        )}
      </header>
      <div className="podium-cards">
        {finals.finalists.map((finalist) => (
          <article className="podium-card" key={finalist.id}>
            <button
              className="podium-card-open"
              type="button"
              onClick={() => onInspect(finalist.id)}
              aria-label={`View ${finalist.projectName} submission`}
            >
              {finalist.teamPhotoUrl && (
                <span
                  className="podium-card-photo"
                  role="img"
                  aria-label={`${finalist.teamName} team`}
                  style={{ backgroundImage: `url("${finalist.teamPhotoUrl}")` }}
                />
              )}
              <h3>{finalist.projectName}</h3>
              <p>{finalist.oneLiner || finalist.teamName}</p>
              <small>{finalist.submitterNames || finalist.teamName}</small>
              <span className="podium-open-label">View submission ↗</span>
            </button>
            {finals.eligibleJudge && (
              <div
                className="podium-card-picks"
                role="group"
                aria-label={`Placement for ${finalist.projectName}`}
              >
                {places.map((place, index) => (
                  <button
                    type="button"
                    key={place}
                    aria-pressed={picks[index] === finalist.id}
                    disabled={saving}
                    onClick={() => choose(finalist.id, index)}
                    aria-label={`${place} place for ${finalist.projectName}`}
                  >
                    {place}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      {finals.eligibleJudge && (
        <div className="podium-submit">
          <ol>
            {picks.map((id, index) => (
              <li key={index}>
                {places[index]} ·{" "}
                {finals.finalists.find((finalist) => finalist.id === id)
                  ?.projectName || "Choose a finalist"}
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={
              saving || !complete || (!dirty && Boolean(finals.ownBallot))
            }
            onClick={() => void save(false)}
          >
            {saving
              ? "Saving…"
              : finals.ownBallot
                ? "Resubmit ballot"
                : "Submit ballot"}
          </button>
        </div>
      )}
      {admin && (
        <section
          className="podium-standings"
          aria-label="Organizer live standings"
        >
          <h2>Live standings</h2>
          <p>
            {finals.completedReviews} of {finals.requiredReviews} ballots
            submitted · 3 points for first, 2 for second, 1 for third.
          </p>
          <p>
            Waiting for:{" "}
            {finals.judges
              .filter((judge) => !finals.submittedJudges?.includes(judge))
              .join(", ") || "Everyone has submitted"}
          </p>
          <div className="podium-table-scroll">
            <table>
              <caption>
                Organizer view · live points; tied totals are marked
              </caption>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>1st votes</th>
                  <th>2nd votes</th>
                  <th>3rd votes</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {finals.standings?.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">
                      {entry.projectName}
                      {finals.completedReviews > 0 &&
                      finals.standings!.some(
                        (other) =>
                          other.id !== entry.id &&
                          other.votePoints === entry.votePoints,
                      )
                        ? " · Tied"
                        : ""}
                    </th>
                    <td>{entry.firstVotes}</td>
                    <td>{entry.secondVotes}</td>
                    <td>{entry.thirdVotes}</td>
                    <td>{entry.votePoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="podium-archive">
            <summary>Archive and lock results (optional)</summary>
            <h3>Final say</h3>
            <p>
              Live winners update automatically without publishing. Only use
              this to save a permanent result and stop ballot changes. Leave
              these empty to use the points leaders, or choose a podium to
              resolve a tie.
            </p>
            <div className="podium-override">
              {places.map((place, index) => (
                <label key={place}>
                  {place} place
                  <select
                    value={winners[index]}
                    disabled={saving}
                    onChange={(event) =>
                      setWinners((current) =>
                        current.map((id, slot) =>
                          slot === index ? event.target.value : id,
                        ),
                      )
                    }
                  >
                    <option value="">Use vote results</option>
                    {finals.finalists.map((entry) => (
                      <option
                        key={entry.id}
                        value={entry.id}
                        disabled={
                          winners.includes(entry.id) &&
                          winners[index] !== entry.id
                        }
                      >
                        {entry.projectName}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={
                saving ||
                !finals.completedReviews ||
                (override && !validOverride)
              }
              onClick={() => void save(true)}
            >
              {saving ? "Saving…" : "Archive and lock final podium"}
            </button>
          </details>
        </section>
      )}
      {error && (
        <p className="podium-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
