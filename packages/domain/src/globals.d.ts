// The only globals domain code may use: web standards that exist in every runtime we target
// (browsers, Node 24, Next.js). Declared here by hand because tsconfig has no DOM lib.
declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

declare class URL {
  constructor(url: string, base?: string);
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}
