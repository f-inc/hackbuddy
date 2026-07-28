import { JUDGING_POLICY } from "@/domain/judging-policy";

export function ScoreControl({
  label,
  lowAnchor,
  highAnchor,
  value,
  onChange,
}: {
  label: string;
  lowAnchor: string;
  highAnchor: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="score-control">
      <div className="score-label">
        <div>
          <legend>{label}</legend>
        </div>
        <strong>{value || "—"}</strong>
      </div>
      <div className="score-options">
        {Array.from(
          {
            length:
              JUDGING_POLICY.score.max - JUDGING_POLICY.score.min + 1,
          },
          (_, index) => index + JUDGING_POLICY.score.min,
        ).map((score) => (
          <button
            aria-label={`${label}: ${score} out of ${JUDGING_POLICY.score.max}`}
            aria-pressed={value === score}
            className={value === score ? "selected" : ""}
            key={score}
            onClick={() => onChange(score)}
            type="button"
          >
            {score}
          </button>
        ))}
      </div>
      <div className="score-scale">
        <span>{lowAnchor}</span>
        <span>{highAnchor}</span>
      </div>
    </fieldset>
  );
}
