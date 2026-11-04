import { MAX_ATTACHMENT_BYTES } from "../limits";
import { mockDelay } from "./delay";
import { FIXTURE_APPLICATION_ID } from "./fixtures/contact";

export type VehicleCode = "moto" | "car" | "van";
export type DriverZoneCode = "city";

export type DriverApplicationInput = {
  fullName: string;
  phone: string;
  vehicle: VehicleCode;
  zone: DriverZoneCode;
  document: { name: string; sizeBytes: number } | null;
};

export type DriverApplicationResult =
  { status: "created"; applicationId: string } | { status: "error"; code: "attachment-too-large" };

/** Mock of POST /v1/driver-applications (W08). */
export async function submitDriverApplication(
  input: DriverApplicationInput,
): Promise<DriverApplicationResult> {
  await mockDelay(600);
  if (input.document && input.document.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { status: "error", code: "attachment-too-large" };
  }
  return { status: "created", applicationId: FIXTURE_APPLICATION_ID };
}
