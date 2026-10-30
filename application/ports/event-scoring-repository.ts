import type { ScoringPolicy } from "@/domain/event-scoring";
import type { PublishedResults } from "@/domain/publication";

export type EventScoringState = {
  scoringPolicy: ScoringPolicy;
  publication: PublishedResults | null;
};
export interface EventScoringRepository {
  read(): Promise<EventScoringState>;
  publish(snapshot: PublishedResults): Promise<PublishedResults>;
}
