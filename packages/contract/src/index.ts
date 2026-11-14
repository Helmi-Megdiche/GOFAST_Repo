/**
 * The API contract as TypeScript types. Source only, no build: the apps import this file.
 * Types come from openapi.yaml; nothing here is written by hand except these aliases.
 */
export type { components, operations, paths } from "./generated/schema";

import type { components } from "./generated/schema";

/** The body of every error answer: `{ error: { code, message, fields, trace_id } }`. */
export type ErrorBody = { error: components["schemas"]["ErrorInfo"] };
export type ErrorCode = components["schemas"]["ErrorCode"];
