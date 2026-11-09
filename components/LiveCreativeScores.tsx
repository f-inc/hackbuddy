import type { LiveCreativeScore } from "@/domain/live-scores";
export function LiveCreativeScores({ scores }: { scores: LiveCreativeScore[] }) {
  return <section className="results-table-card card" aria-label="Live Creative scores">
    <div className="section-header"><div>
      <h2>Live Creative scores</h2>
      <p>Weighted averages update as judges submit. Scores remain provisional until results are published.</p>
    </div><span className="live-indicator"><span />Live</span></div>
    <div className="results-table-scroll"><table className="results-table">
      <thead><tr><th>Project</th><th>Review progress</th><th>Provisional average /100</th></tr></thead>
      <tbody>{scores.map(score => <tr key={score.id}>
        <td><div className="result-project"><strong>{score.projectName}</strong>
          {score.teamNumber && <span>Team {score.teamNumber}</span>}</div></td>
        <td><strong>{score.reviewCount}/{score.requiredReviews} reviews</strong>
          <div className="field-hint">{score.reviewCount >= score.requiredReviews
            ? "Review target met" : score.reviewCount ? "Awaiting more reviews" : "No reviews yet"}</div></td>
        <td><span className="result-total">{score.averageScore === null ? "—" : score.averageScore.toFixed(2)}</span>
          {score.averageScore !== null && <div className="field-hint">Provisional</div>}</td>
      </tr>)}</tbody>
    </table></div>
    {!scores.length && <p>No Creative submissions yet.</p>}
  </section>;
}
