import { SetMetadata } from "@nestjs/common";

export const OPERATION = "fastgo:operation";

/**
 * Binds a handler to an `operationId` of the contract. The guard reads roles, parameters and body
 * schema from the contract by this id; nothing about the route is declared twice.
 */
export const Operation = (operationId: string) => SetMetadata(OPERATION, operationId);
