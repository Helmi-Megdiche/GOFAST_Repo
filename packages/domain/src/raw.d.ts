// Vite's `?raw` import: the text of a file (the cahier fixtures of the tests).
declare module "*?raw" {
  const text: string;
  export default text;
}
