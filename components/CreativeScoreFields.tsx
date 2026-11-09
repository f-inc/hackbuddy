"use client";
import { ScoreControl } from "./ScoreControl";
import { CREATIVE_RUBRIC, type CreativeScores } from "@/domain/creative-rubric";
export function CreativeScoreFields({
  value,
  onChange,
  readOnly = false,
}: {
  value: CreativeScores;
  onChange?: (value: CreativeScores) => void;
  readOnly?: boolean;
}) {
  return (
    <>
      <label className="field">
        <span>Demo format</span>
        <select
          value={value.demoFormat}
          disabled={readOnly}
          onChange={(e) =>
            onChange?.({
              ...value,
              demoFormat: e.target.value as "live" | "video",
              demoQuality:
                e.target.value === "video"
                  ? Math.min(value.demoQuality, 3)
                  : value.demoQuality,
            })
          }
        >
          <option value="live">Live robot demo</option>
          <option value="video">Video demo (Demo quality capped at 3)</option>
        </select>
      </label>
      {CREATIVE_RUBRIC.map((axis) => (
        <div key={axis.key}>
          <ScoreControl
            label={axis.label + " · " + axis.weight + "%"}
            max={
              axis.key === "demoQuality" && value.demoFormat === "video" ? 3 : 5
            }
            lowAnchor={"1: " + axis.low}
            highAnchor={
              axis.key === "demoQuality" && value.demoFormat === "video"
                ? "Video cap: 3"
                : "5: " + axis.high
            }
            readOnly={readOnly}
            value={value[axis.key]}
            onChange={(score) => onChange?.({ ...value, [axis.key]: score })}
          />
          <small className="field-hint">3: {axis.middle}</small>
        </div>
      ))}
      <label className="field compact-notes">
        <span>
          Hardware / software access notes <small>Optional</small>
        </span>
        <textarea
          readOnly={readOnly}
          value={value.hardwareNotes}
          rows={2}
          placeholder="Note equipment or software not available to every team; judges may discount Technical difficulty."
          onChange={(e) =>
            onChange?.({ ...value, hardwareNotes: e.target.value })
          }
        />
      </label>
    </>
  );
}
export function CreativeBreakdown({ value }: { value: CreativeScores }) {
  return (
    <>
      {CREATIVE_RUBRIC.map((axis) => (
        <span key={axis.key}>
          {axis.label}: <strong>{value[axis.key]}/5</strong> ({axis.weight}
          %){" "}
        </span>
      ))}
    </>
  );
}
