import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { FileAttach } from "./file-attach";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("FileAttach ref (GH-82)", () => {
  it("forwards the ref to the real file input so a form can focus it", () => {
    const ref = createRef<HTMLInputElement>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FileAttach ref={ref} label="Add" removeLabel="Remove" value={null} onChange={() => {}} />,
      );
    });

    const input = host.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(ref.current).toBe(input);

    ref.current?.focus();
    expect(document.activeElement).toBe(input);
    act(() => root.unmount());
  });
});
