/**
 * The sign-up, reset or Google step in progress, kept in memory only (never in storage or the URL):
 * the sign-up password stays in React-side memory and is lost on reload, which sends the visitor
 * back to the form (plan, amendment "never persist password or code").
 */
export type AuthFlow =
  | {
      kind: "signUp";
      account: {
        kind: "customer" | "merchant";
        name: string;
        phone: string;
        email: string;
        password: string;
      };
      next: string;
    }
  | { kind: "reset"; phone: string; next: string }
  | { kind: "googleEmail"; next: string }
  | { kind: "googlePhone"; phone: string; next: string };

let current: AuthFlow | null = null;

export function startFlow(flow: AuthFlow): void {
  current = flow;
}

export function currentFlow(): AuthFlow | null {
  return current;
}

export function endFlow(): void {
  current = null;
}
