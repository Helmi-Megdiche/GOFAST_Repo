import type { FastifyRequest } from "fastify";
export type { Operation } from "./spec.ts";

export const OPERATIONS = Symbol("fastgo:operations");

/**
 * Optional: per operation id, what to do when the guard is about to refuse the input of a request (400). The public tracking uses it to
 * count a malformed number as a miss (T11), since the guard answers before the route runs. The hook may throw (429) instead.
 */
export const ON_INVALID_INPUT = Symbol("fastgo:on-invalid-input");
export type InvalidInputHooks = Record<string, (req: FastifyRequest) => Promise<void>>;
