import { mockDelay } from "./delay";

// Tokens handed out in this browser session. The real provider is not chosen yet: the contact
// form only depends on these two functions.
const issued = new Set<string>();
let counter = 0;

/** Mock of the captcha widget: ticking "I am not a robot" yields a token. */
export async function requestCaptchaToken(): Promise<string> {
  await mockDelay(250);
  counter += 1;
  const token = `mock-captcha-${counter}`;
  issued.add(token);
  return token;
}

/** Mock of the server-side check. A token works once. */
export async function verifyCaptcha(token: string): Promise<boolean> {
  await mockDelay(0);
  return issued.delete(token);
}
