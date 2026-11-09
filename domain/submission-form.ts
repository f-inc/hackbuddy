export const MAKERMODS_FORM = "makermods-physical-ai" as const;
export type SubmissionFormTemplate = "standard" | typeof MAKERMODS_FORM;
export const MAKERMODS_TRACK = "Creative Applications" as const;
export const MAKERMODS_HILL_TRACK = "Hill Climb" as const;
export const MAKERMODS_TRACKS = [
  MAKERMODS_TRACK,
  MAKERMODS_HILL_TRACK,
] as const;
export const MAKERMODS_TOOLS = ["Dream-1", "LiveKit", "Dimensional"] as const;
export const SUBMISSION_EDIT_TOKEN = /^[a-f0-9]{64}$/;
export const SUBMISSION_REQUEST_ID = /^[a-zA-Z0-9-]{20,100}$/;
