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
        {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
          <button
            aria-label={`${label}: ${score} out of 10`}
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
