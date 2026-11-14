/**
 * The API contract as TypeScript types. Source only, no build: the apps import this file.
 * Types come from openapi.yaml; nothing here is written by hand except these aliases.
 */
export type { components, operations, paths } from "./generated/schema";

import type { components } from "./generated/schema";

export type ErrorBody = components["schemas"]["ErrorBody"];
export type ErrorCode = components["schemas"]["ErrorCode"];
