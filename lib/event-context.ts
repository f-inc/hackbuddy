import { AsyncLocalStorage } from "node:async_hooks";
import type { HackathonConfig } from "./hackathons";
import { eventSettings } from "@/domain/event-settings";
const context = new AsyncLocalStorage<HackathonConfig>();
export function withEventConfig<T>(config: HackathonConfig, operation: () => Promise<T>) {
  return context.run(config, operation);
}
export function currentEventConfig() {
  return context.getStore();
}
export function currentEventSettings() {
  return eventSettings(currentEventConfig()?.settings);
}
