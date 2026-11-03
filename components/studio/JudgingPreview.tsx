"use client";
import { useId, useState } from "react";
import { defaultRules } from "@/domain/studio/model";

const criteria = defaultRules.criteria;
const initialScores = () => Object.fromEntries(criteria.map((c) => [c.id, 5]));

export function JudgingPreview() {
  const id = useId();
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [submitted, setSubmitted] = useState<Record<string, number> | null>(
    null,
  );
  const total = submitted
    ? Object.values(submitted).reduce((sum, value) => sum + value, 0)
    : 0;
  return (
    <article
      className="s-hero-preview s-judging-preview"
      aria-label="Interactive sample project review"
    >
      <div className="s-demo-heading">
        <span className="s-tag">Try judging a project</span>
        <span className="s-caption">Sample submission</span>
      </div>
      <div className="s-demo-project">
        <h2>WorldGym</h2>
        <p className="s-demo-builder">Built by Ritik Bompilwar</p>
        <p>Turn any video into a simulation for RL training.</p>
      </div>
      <iframe
        className="s-demo-video"
        src="https://www.youtube-nocookie.com/embed/3elKnbDIqeo"
        title="WorldGym Baseball — project demo by Ritik Bompilwar"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      <div className="s-demo-video-caption">
        <span>Watch the demo. Give it a score.</span>
        <a
          href="https://www.youtube.com/watch?v=3elKnbDIqeo"
          target="_blank"
          rel="noreferrer"
        >
          YouTube ↗
        </a>
      </div>
      {submitted ? (
        <div className="s-demo-receipt" role="status" aria-live="polite">
          <span className="s-demo-check" aria-hidden="true">
            ✓
          </span>
          <h3>Review submitted.</h3>
          <p>
            Your score:{" "}
            <strong>
              {total} / {criteria.reduce((sum, c) => sum + c.max, 0)}
            </strong>
          </p>
          <div className="s-demo-score-summary">
            {criteria.map((c) => (
              <span key={c.id}>
                {c.name} <strong>{submitted[c.id]}</strong>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSubmitted(null);
              setScores(initialScores());
            }}
          >
            Score it again ↻
          </button>
        </div>
      ) : (
        <form
          className="s-demo-review"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted({ ...scores });
          }}
        >
          {criteria.map((c) => (
            <div className="s-demo-criterion" key={c.id}>
              <div>
                <label htmlFor={`${id}-${c.id}`}>{c.name}</label>
                <output htmlFor={`${id}-${c.id}`} aria-live="off">
                  {scores[c.id]}
                  <span> / {c.max}</span>
                </output>
              </div>
              <input
                id={`${id}-${c.id}`}
                className="s-demo-slider"
                type="range"
                min={c.min}
                max={c.max}
                step={1}
                value={scores[c.id]}
                aria-valuetext={`${scores[c.id]} out of ${c.max}`}
                onChange={(event) =>
                  setScores((previous) => ({
                    ...previous,
                    [c.id]: Number(event.target.value),
                  }))
                }
              />
            </div>
          ))}
          <button className="s-inverse" type="submit">
            Submit review ↗
          </button>
        </form>
      )}
      <p className="s-demo-disclaimer">
        Just a practice review. Live hackathon results stay untouched.
      </p>
    </article>
  );
}
