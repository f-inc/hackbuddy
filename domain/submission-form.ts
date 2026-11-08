export const MAKERMODS_FORM = "makermods-physical-ai" as const;
export type SubmissionFormTemplate = "standard" | typeof MAKERMODS_FORM;
export const MAKERMODS_TRACK = "Creative Applications" as const;
export const MAKERMODS_TOOLS = ["MakerMods", "Dream Labs", "LiveKit"] as const;
export const SUBMISSION_REQUEST_ID = /^[a-zA-Z0-9-]{20,100}$/;
