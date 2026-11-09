"use client";
import { creativeScoring, reviewMaximum } from "@/domain/creative-rubric";
import { createContext, useContext } from "react";
import { eventSettings, type EventSettings } from "@/domain/event-settings";
const Managed = createContext(false);
export function useManagedEvent() {
  return useContext(Managed);
}
const Context = createContext<EventSettings>(eventSettings());
export function EventConfig({
  settings,
  managed = false,
  children,
}: {
  settings?: EventSettings;
  managed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Managed.Provider value={managed}>
      <Context.Provider value={eventSettings(settings)}>{children}</Context.Provider>
    </Managed.Provider>
  );
}
export function useEventSettings() {
  return useContext(Context);
}
export function useJudgingPolicy() {
  const s = useEventSettings();
  return {
    creative: creativeScoring(s),
    reviewMax: reviewMaximum(s),
    score: { min: 1, max: s.scoreMax },
    preliminary: { requiredReviews: s.requiredReviews },
    finals: { finalistCount: s.finalistCount, winnerCount: 3 },
  };
}
