import { EventEmitter } from "events";

// In-process event bus: the callback route emits, the job-stream route listens.
//
// This is a fast path, NOT the delivery guarantee. With more than one replica
// the callback can land on a different instance than the one holding the
// stream, and nothing here would ever fire. job-stream polls the same row the
// callback writes, so correctness does not depend on both landing together.
const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(500);

export { jobEvents };
