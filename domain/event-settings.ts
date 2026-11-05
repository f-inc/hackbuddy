export type Collection = {
  id: string;
  name: string;
  tool: string;
  track: string;
  sponsor: string;
  logo: string;
  prize: string;
};
export type Sponsor = { id: string; name: string; logo: string };
export type EventSettings = {
  requiredReviews: number;
  finalistCount: number;
  scoreMax: 5 | 10;
  submissionsOpen: boolean;
  collections: Collection[];
  sponsors?: Sponsor[];
};
export const DEFAULT_EVENT_SETTINGS: EventSettings = {
  requiredReviews: 2,
  finalistCount: 7,
  scoreMax: 10,
  submissionsOpen: true,
  collections: [],
};
export function eventSettings(input?: Partial<EventSettings>): EventSettings {
  return { ...DEFAULT_EVENT_SETTINGS, ...input };
}
export function matchesCollection(
  project: { toolsUsed?: string[]; track: string },
  collection: Collection,
) {
  return (
    (!collection.tool ||
      (project.toolsUsed || []).some(
        (tool) => tool.toLowerCase() === collection.tool.toLowerCase(),
      )) &&
    (!collection.track || project.track.toLowerCase() === collection.track.toLowerCase())
  );
}
