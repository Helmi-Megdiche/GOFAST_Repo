import { fileError } from "@fastgo/domain";
import { mockDelay } from "./delay";
import { FIXTURE_APPLICATION_ID } from "./fixtures/contact";

/** GOFAST's vehicles for the driver application (reponses-gofast.md, "Livreurs"). */
export const DRIVER_VEHICLES = ["scooter", "motorbike", "car", "lightVan"] as const;
export type VehicleCode = (typeof DRIVER_VEHICLES)[number];

/**
 * GOFAST's list of documents. The phone is the phone field, not an upload. Nothing else is asked
 * without legal advice.
 */
export const DRIVER_DOCUMENTS = [
  "cin",
  "licence",
  "registration",
  "insurance",
  "vehiclePhoto",
  "bankDetails",
] as const;
export type DriverDocumentCode = (typeof DRIVER_DOCUMENTS)[number];

export type DriverZoneCode = "city";

/** What the server keeps of a file: never its content. */
export type DriverDocumentInfo = { name: string; type: string; sizeBytes: number };

export type DriverApplicationInput = {
  fullName: string;
  phone: string;
  vehicle: VehicleCode;
  zone: DriverZoneCode;
  documents: Record<DriverDocumentCode, DriverDocumentInfo | null>;
};

export type DriverApplicationError =
  | { status: "error"; code: "vehicle-invalid" }
  | {
      status: "error";
      code: "document-missing" | "attachment-too-large" | "attachment-bad-type";
      document: DriverDocumentCode;
    };

export type DriverApplicationResult =
  { status: "created"; applicationId: string } | DriverApplicationError;

/**
 * What the mock server received, in memory only (identity documents are personal data: nothing in
 * localStorage, nothing in the URL). Per document: name, type and size, never the content.
 */
type ReceivedApplication = {
  vehicle: VehicleCode;
  documents: Record<DriverDocumentCode, DriverDocumentInfo>;
};
let received: ReceivedApplication[] = [];

export const receivedDriverApplications = (): readonly ReceivedApplication[] => received;
export const resetDriverApplications = (): void => {
  received = [];
};

/** Mock of POST /v1/driver-applications (W08). Checks every file again, as the server will. */
export async function submitDriverApplication(
  input: DriverApplicationInput,
): Promise<DriverApplicationResult> {
  await mockDelay(600);
  if (!(DRIVER_VEHICLES as readonly string[]).includes(input.vehicle)) {
    return { status: "error", code: "vehicle-invalid" };
  }
  const documents = {} as ReceivedApplication["documents"];
  for (const document of DRIVER_DOCUMENTS) {
    const file = input.documents[document];
    if (!file) return { status: "error", code: "document-missing", document };
    // One file rule for every upload: images and PDF, 5 MB (packages/domain/src/attachments.ts).
    const problem = fileError(file);
    if (problem) {
      const code = problem === "tooLarge" ? "attachment-too-large" : "attachment-bad-type";
      return { status: "error", code, document };
    }
    documents[document] = { name: file.name, type: file.type, sizeBytes: file.sizeBytes };
  }
  received.push({ vehicle: input.vehicle, documents });
  return { status: "created", applicationId: FIXTURE_APPLICATION_ID };
}
