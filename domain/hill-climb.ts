export const HILL_CLIMB_TRACK = "Hill Climb";
export function isHillClimb(project: { track: string }) {
  return project.track.trim().toLowerCase() === HILL_CLIMB_TRACK.toLowerCase();
}
export type HillClimbRun = {
  cablesUnplugged: number;
  cablesPlugged: number;
  towerHeight: number;
  towerStable: boolean;
  tallerTower: boolean;
  headToHead: boolean;
  golfBalls: number;
  blackBall: boolean;
  liveKit: boolean;
  dimensional: boolean;
  skippedStage: boolean;
  humanTouch: boolean;
  humanInput: boolean;
};
export const EMPTY_HILL_RUN: HillClimbRun = {
  cablesUnplugged: 0,
  cablesPlugged: 0,
  towerHeight: 0,
  towerStable: false,
  tallerTower: false,
  headToHead: false,
  golfBalls: 0,
  blackBall: false,
  liveKit: false,
  dimensional: false,
  skippedStage: false,
  humanTouch: false,
  humanInput: false,
};
export type HillClimbGrade = {
  run: HillClimbRun;
  points: number;
  disqualified: boolean;
  automaticLoss: boolean;
  judge: string;
  updatedAt: string;
};
export function hillClimbScore(run: HillClimbRun) {
  const stage1 = run.cablesUnplugged > 0;
  const stage2 = stage1 && run.towerStable;
  const disqualified = run.skippedStage || run.humanTouch || run.humanInput;
  const cables =
    (stage1 ? 10 + (run.cablesUnplugged - 1) * 5 : 0) + run.cablesPlugged * 20;
  const tower = stage2
    ? 20 +
      Math.floor(run.towerHeight) * 3 +
      (run.headToHead && run.tallerTower ? 10 : 0)
    : 0;
  const balls = stage2 ? run.golfBalls * 5 : 0;
  const tools = (run.liveKit ? 10 : 0) + (run.dimensional ? 5 : 0);
  return {
    points: disqualified ? 0 : cables + tower + balls + tools,
    disqualified,
    automaticLoss: disqualified || run.blackBall,
    breakdown: { cables, tower, balls, tools },
  };
}
export function validHillRun(value: unknown): value is HillClimbRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const run = value as HillClimbRun;
  for (const key of ["cablesUnplugged", "cablesPlugged", "golfBalls"] as const)
    if (!Number.isSafeInteger(run[key]) || run[key] < 0 || run[key] > 10000)
      return false;
  if (
    run.cablesPlugged > 4 ||
    !Number.isFinite(run.towerHeight) ||
    run.towerHeight < 0 ||
    run.towerHeight > 10000
  )
    return false;
  for (const key of [
    "towerStable",
    "tallerTower",
    "headToHead",
    "blackBall",
    "liveKit",
    "dimensional",
    "skippedStage",
    "humanTouch",
    "humanInput",
  ] as const)
    if (typeof run[key] !== "boolean") return false;
  if (run.tallerTower && (!run.headToHead || !run.towerStable)) return false;
  // A referee may record what happened after a DQ, but it always scores zero.
  if (!(run.skippedStage || run.humanTouch || run.humanInput)) {
    if ((run.towerHeight > 0 || run.towerStable) && !run.cablesUnplugged)
      return false;
    if (
      (run.golfBalls > 0 || run.blackBall) &&
      !(run.cablesUnplugged > 0 && run.towerStable)
    )
      return false;
  }
  return true;
}
