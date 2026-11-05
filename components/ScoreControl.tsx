import { JUDGING_POLICY } from "@/domain/judging-policy";

export function ScoreControl({
  label,
  lowAnchor,
  highAnchor,
  value,
  onChange,
  readOnly = false,
  max = JUDGING_POLICY.score.max,
}: {
  label: string;
  lowAnchor: string;
  highAnchor: string;
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  max?: number;
}) {
  const min = JUDGING_POLICY.score.min;
  return (
    <fieldset className="score-control" disabled={readOnly}>
      <div className="score-label">
        <div>
          <legend>{label}</legend>
        </div>
        <strong>{value || "—"}</strong>
      </div>
      <div
        className="score-options"
        style={
          min === JUDGING_POLICY.score.min && max === JUDGING_POLICY.score.max
            ? undefined
            : { gridTemplateColumns: `repeat(${max - min + 1}, minmax(0, 1fr))` }
        }
      >
        {Array.from({ length: max - min + 1 }, (_, index) => index + min).map((score) => (
          <button
            aria-label={`${label}: ${score} out of ${max}`}
            aria-pressed={value === score}
            className={value === score ? "selected" : ""}
            key={score}
            onClick={() => onChange?.(score)}
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
