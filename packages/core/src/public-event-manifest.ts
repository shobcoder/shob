export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@shob/schema/event"
import { EventManifest } from "@shob/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
