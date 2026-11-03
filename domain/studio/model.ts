import { JUDGING_POLICY } from "../judging-policy";
export type Stage =
  | "draft"
  | "ready"
  | "judging"
  | "final"
  | "published"
  | "archived";
export type Template = "single" | "scored-final" | "ranked-final";
export type Criterion = {
  id: string;
  name: string;
  guidance: string;
  min: number;
  max: number;
  weight: number;
};
export type Award = {
  id: string;
  name: string;
  sponsor: string;
  logo: string;
  tool: string;
  track: string;
  prize: string;
};
export type Rules = {
  version: 1;
  template: Template;
  criteria: Criterion[];
  reviews: number;
  finalReviews: number;
  finalistCount: number;
  winnerCount: number;
  points: number[];
  scoring: "average" | "normalized";
  visibility: "blind" | "after-review" | "live";
  publicGallery: boolean;
  publicResults: boolean;
  guests: boolean;
  quorum: "all" | "one";
  reservationMinutes: number;
};
export type Event = {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  description: string;
  image: string;
  stage: Stage;
  rules: Rules;
  sponsors: Award[];
  finalists: string[];
  finalJudgeIds?: string[];
  frozenRules: Rules | null;
  judgePassword: string;
  createdAt: string;
  updatedAt: string;
};
export type Project = {
  id: string;
  eventId: string;
  externalId: string;
  name: string;
  team: string;
  description: string;
  track: string;
  tools: string;
  demo: string;
  repository: string;
  image: string;
  email: string;
  createdAt: string;
};
export type Judge = {
  id: string;
  eventId: string;
  name: string;
  key: string;
  active: boolean;
  tracks: string[];
  conflicts: string[];
};
export type Review = {
  id: string;
  eventId: string;
  projectId: string;
  judgeId: string;
  round: string;
  scores: Record<string, number>;
  notes: string;
  submittedAt: string;
};
export type Ballot = { judgeId: string; picks: string[]; submittedAt: string };
export type Rank = {
  project: Project;
  score: number;
  rawScore: number;
  reviews: number;
  tied: boolean;
};
export type Publication = {
  id: string;
  eventId: string;
  revision: number;
  reason: string;
  publishedAt: string;
  publishedBy: string;
  eventName: string;
  rules: Rules;
  results: Rank[];
  winners: Rank[];
  finalists: Project[];
  sponsors: Award[];
};
export type StudioActor = {
  role: "organizer" | "judge";
  orgId: string;
  name: string;
  userId?: string;
  eventId?: string;
  judgeId?: string;
  demo?: boolean;
};
export type Workspace = { id: string; name: string; slug: string };
export type Reservation = {
  projectId: string;
  judgeId: string;
  expiresAt: string;
  round: string;
};
export type Draft = {
  scores: Record<string, number>;
  notes: string;
  updatedAt: string;
};
export type EventView = {
  event: Omit<Event, "judgePassword"> & { passwordSet: boolean };
  projects: Project[];
  judges: Judge[];
  results: Rank[];
  preliminary: Rank[];
  shortlist: Project[];
  liveWinners: Rank[];
  publication: Publication | null;
  publications: Publication[];
  reservations: Reservation[];
  reviews: Review[];
  ballots: Ballot[];
  actor: StudioActor;
  readiness: { label: string; ok: boolean }[];
  stats: {
    projects: number;
    reviews: number;
    complete: number;
    required: number;
    ballots: number;
  };
  audit: {
    id: string;
    action: string;
    actor: string;
    at: string;
    detail: string;
  }[];
};
export const defaultRules: Rules = {
  version: 1,
  template: "ranked-final",
  criteria: JUDGING_POLICY.rubric.map((criterion) => ({
    id: criterion.key,
    name: criterion.label,
    guidance: criterion.description,
    min: JUDGING_POLICY.score.min,
    max: JUDGING_POLICY.score.max,
    weight: 1,
  })),
  reviews: 2,
  finalReviews: 2,
  finalistCount: 7,
  winnerCount: 3,
  points: [3, 2, 1],
  scoring: "normalized",
  visibility: "blind",
  publicGallery: true,
  publicResults: true,
  guests: true,
  quorum: "one",
  reservationMinutes: 15,
};
export function fail(message: string): never {
  throw new Error(message);
}
export function text(value: unknown, max = 2000): string {
  if (typeof value !== "string") return "";
  if (value.length > max) fail(`Text must be ${max} characters or fewer.`);
  return value.trim();
}
export function required(value: unknown, label: string, max = 200): string {
  return text(value, max) || fail(`${label} is required.`);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Expected an object.");
  return value as Record<string, unknown>;
}
export function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    fail(`${label} must be a whole number between ${min} and ${max}.`);
  return Number(value);
}
export function url(value: unknown): string {
  const s = text(value);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      fail("Invalid URL.");
    return u.toString();
  } catch {
    return fail("Use a valid http or https URL.");
  }
}
export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}
export function validateRules(input: unknown): Rules {
  const v = object(input);
  if (!["single", "scored-final", "ranked-final"].includes(String(v.template)))
    fail("Choose a judging format.");
  if (
    !Array.isArray(v.criteria) ||
    !v.criteria.length ||
    v.criteria.length > 12
  )
    fail("Add between 1 and 12 criteria.");
  const criteria = v.criteria.map((item) => {
    const c = object(item);
    const min = integer(c.min, "Minimum", 0, 99);
    const max = integer(c.max, "Maximum", min + 1, 100);
    const weight = Number(c.weight);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100)
      fail("Criterion weights must be greater than 0 and at most 100.");
    const id = required(c.id, "Criterion ID", 60);
    if (["__proto__", "constructor", "prototype"].includes(id))
      fail("Choose a different criterion ID.");
    if (!/^[a-zA-Z0-9_-]+$/.test(id))
      fail(
        "Criterion IDs may contain letters, numbers, underscores, and hyphens.",
      );
    return {
      id,
      name: required(c.name, "Criterion name", 100),
      guidance: text(c.guidance, 1000),
      min,
      max,
      weight,
    };
  });
  if (new Set(criteria.map((c) => c.id)).size !== criteria.length)
    fail("Criterion IDs must be unique.");
  const winnerCount = integer(v.winnerCount, "Winner count", 1, 20);
  const finalistCount = integer(
    v.finalistCount,
    "Finalist count",
    winnerCount,
    100,
  );
  if (!Array.isArray(v.points) || v.points.length !== winnerCount)
    fail("Provide one point value for each ballot position.");
  const points = v.points.map((p) => integer(p, "Ballot points", 1, 100));
  if (points.some((p, i) => i > 0 && p > points[i - 1]))
    fail("Ballot points must be in descending order.");
  if (
    !["average", "normalized"].includes(String(v.scoring)) ||
    !["blind", "after-review", "live"].includes(String(v.visibility)) ||
    !["all", "one"].includes(String(v.quorum))
  )
    fail("Invalid scoring, visibility, or quorum setting.");
  return {
    version: 1,
    template: v.template as Template,
    criteria,
    reviews: integer(v.reviews, "Reviews per project", 1, 20),
    finalReviews: integer(v.finalReviews, "Final reviews", 1, 20),
    finalistCount,
    winnerCount,
    points,
    scoring: v.scoring as Rules["scoring"],
    visibility: v.visibility as Rules["visibility"],
    publicGallery: v.publicGallery === true,
    publicResults: v.publicResults === true,
    guests: v.guests === true,
    quorum: v.quorum as Rules["quorum"],
    reservationMinutes: integer(
      v.reservationMinutes,
      "Reservation duration",
      2,
      120,
    ),
  };
}
export function validateScores(value: unknown, rules: Rules) {
  const scores = object(value);
  const result: Record<string, number> = {};
  for (const c of rules.criteria)
    result[c.id] = integer(scores[c.id], c.name, c.min, c.max);
  return result;
}
export function rankProjects(
  projects: Project[],
  reviews: Review[],
  rules: Rules,
): Rank[] {
  const weight = rules.criteria.reduce((sum, c) => sum + c.weight, 0);
  const judgeStats = new Map<
    string,
    { mean: number; variance: number; n: number }
  >();
  for (const c of rules.criteria) {
    const ids = [...new Set(reviews.map((r) => r.judgeId))];
    for (const id of ids) {
      const values = reviews
        .filter((r) => r.judgeId === id)
        .map((r) => r.scores[c.id])
        .filter(Number.isFinite);
      const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
      judgeStats.set(`${id}:${c.id}`, {
        mean,
        variance:
          values.reduce((s, v) => s + (v - mean) ** 2, 0) /
          (values.length || 1),
        n: values.length,
      });
    }
  }
  const pooled = (c: Criterion) => {
    const stats = [...new Set(reviews.map((r) => r.judgeId))].map(
      (id) => judgeStats.get(`${id}:${c.id}`)!,
    );
    const count = stats.reduce((s, v) => s + v.n, 0);
    return stats.reduce((s, v) => s + v.variance * v.n, 0) / (count || 1);
  };
  const results = projects
    .map((project) => {
      const own = reviews.filter((r) => r.projectId === project.id);
      const rawScore =
        own.reduce(
          (sum, r) =>
            sum +
            (rules.criteria.reduce(
              (s, c) =>
                s + ((r.scores[c.id] - c.min) / (c.max - c.min)) * c.weight,
              0,
            ) /
              weight) *
              100,
          0,
        ) / (own.length || 1);
      const normalized =
        own.reduce(
          (sum, r) =>
            sum +
            rules.criteria.reduce((s, c) => {
              const st = judgeStats.get(`${r.judgeId}:${c.id}`)!;
              if (st.n < 2 || st.variance === 0) return s;
              const w = st.n / (st.n + 5);
              const spread = Math.max(
                (c.max - c.min) / 9,
                Math.sqrt(w * st.variance + (1 - w) * pooled(c)),
              );
              return s + (c.weight * w * (r.scores[c.id] - st.mean)) / spread;
            }, 0) /
              weight,
          0,
        ) / (own.length || 1);
      return {
        project,
        score: rules.scoring === "normalized" ? normalized : rawScore,
        rawScore,
        reviews: own.length,
        tied: false,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.project.name.localeCompare(b.project.name) ||
        a.project.id.localeCompare(b.project.id),
    );
  return results.map((r, i) => ({
    ...r,
    tied: results.some(
      (other, j) => i !== j && Math.abs(other.score - r.score) < 1e-10,
    ),
  }));
}
export function rankBallots(
  projects: Project[],
  ballots: Ballot[],
  rules: Rules,
): Rank[] {
  const ranked = projects
    .map((project) => ({
      project,
      score: ballots.reduce((n, b) => {
        const position = b.picks.indexOf(project.id);
        return n + (position < 0 ? 0 : rules.points[position] || 0);
      }, 0),
      rawScore: 0,
      reviews: ballots.length,
      tied: false,
    }))
    .sort(
      (a, b) =>
        b.score - a.score || a.project.name.localeCompare(b.project.name),
    );
  return ranked.map((r) => ({
    ...r,
    tied: ranked.some(
      (other) => other.project.id !== r.project.id && other.score === r.score,
    ),
  }));
}
export const csvHeaders = [
  "id",
  "name",
  "team",
  "description",
  "track",
  "tools",
  "demo",
  "repository",
  "image",
  "email",
];
export function parseCsv(source: string): Record<string, string>[] {
  if (source.length > 5_000_000) fail("CSV files must be smaller than 5 MB.");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  source = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else fail("Unexpected quote in CSV. Quote the entire cell.");
    } else if (!quoted && (ch === "," || ch === "\n" || ch === "\r")) {
      row.push(cell.trim());
      cell = "";
      if (ch !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (ch === "\r" && source[i + 1] === "\n") i++;
      }
    } else cell += ch;
  }
  if (quoted) fail("CSV contains an unclosed quote.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = (rows.shift() || []).map((h) => h.toLowerCase().trim());
  if (!headers.includes("name"))
    fail("CSV needs a name column. Download the template for an example.");
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    fail("CSV headers must be nonempty and unique.");
  if (rows.length > 5000) fail("Import at most 5,000 projects at a time.");
  return rows.map((r, i) => {
    if (r.length !== headers.length)
      fail(`Row ${i + 2} has ${r.length} columns; expected ${headers.length}.`);
    const mapped = Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    if (!mapped.name) fail(`Row ${i + 2}: project name is required.`);
    return mapped;
  });
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function toCsv(rows: Record<string, unknown>[], headers: string[]) {
  return (
    "\uFEFF" +
    [
      headers.map(csvCell).join(","),
      ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(",")),
    ].join("\r\n")
  );
}
