import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NavGroup, NavItem, PageHeader, Sidebar, UserMenu } from "../index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// GH-25 25b: the shared components of the back-office shell. They take translated strings and know no catalog, no router, no role.

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function mount(node: ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});
const click = (el: Element | null) => act(() => el?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const press = (key: string) => act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));

describe("NavItem", () => {
  it("is a link in a list item, current only when told, with an optional count", () => {
    const el = mount(
      <ul>
        <NavItem href="/a" current>
          Orders
        </NavItem>
        <NavItem href="/b" count={7}>
          Confirm
        </NavItem>
      </ul>,
    );
    const links = [...el.querySelectorAll("li > a")];
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual(["page", null]);
    expect(links[1]?.textContent).toContain("7");
    expect(links[0]?.getAttribute("href")).toBe("/a");
  });
  it("renders the component it is given (a router link), keeping the props", () => {
    const Custom = ({ children, ...p }: { children?: ReactNode; "data-x"?: string }) => <a {...p}>{children}</a>;
    const el = mount(
      <ul>
        <NavItem as={Custom} data-x="1">
          X
        </NavItem>
      </ul>,
    );
    expect(el.querySelector("a")?.getAttribute("data-x")).toBe("1");
  });
});

describe("NavGroup", () => {
  it("is a group named by its label, holding the list of items", () => {
    const el = mount(
      <NavGroup label="Finance">
        <NavItem href="/c">Cash</NavItem>
      </NavGroup>,
    );
    const group = el.querySelector('[role="group"]');
    const nameId = group?.getAttribute("aria-labelledby") ?? "";
    expect(el.querySelector(`[id="${nameId}"]`)?.textContent).toBe("Finance");
    expect(group?.querySelectorAll("li")).toHaveLength(1);
  });
});

describe("Sidebar: a drawer below the desktop width", () => {
  const tree = (
    <Sidebar label="Back-office" logo={<span>logo</span>} menuLabel="Menu" closeLabel="Close the menu" footer={<p>footer</p>}>
      <NavGroup label="Ops">
        <NavItem href="/a" current>
          Orders
        </NavItem>
      </NavGroup>
    </Sidebar>
  );
  const nav = (el: HTMLElement) => el.querySelector("nav") as HTMLElement;
  const menuButton = (el: HTMLElement) => el.querySelector("header button") as HTMLButtonElement;

  it("is a nav with the label; the menu button starts closed and controls it", () => {
    const el = mount(tree);
    expect(nav(el).getAttribute("aria-label")).toBe("Back-office");
    expect(menuButton(el).getAttribute("aria-expanded")).toBe("false");
    expect(menuButton(el).getAttribute("aria-controls")).toBe(nav(el).id);
    expect(nav(el).getAttribute("data-open")).toBe("false");
    expect(el.textContent).toContain("footer");
  });

  it("the menu button opens it, and the close button, Escape and a click on a link close it", () => {
    const el = mount(tree);
    click(menuButton(el));
    expect(menuButton(el).getAttribute("aria-expanded")).toBe("true");
    expect(nav(el).getAttribute("data-open")).toBe("true");
    click(el.querySelector('nav button[aria-label="Close the menu"]'));
    expect(nav(el).getAttribute("data-open")).toBe("false");

    click(menuButton(el));
    press("Escape");
    expect(nav(el).getAttribute("data-open")).toBe("false");
    expect(document.activeElement).toBe(menuButton(el)); // the focus goes back where it came from

    click(menuButton(el));
    click(el.querySelector("nav a"));
    expect(nav(el).getAttribute("data-open")).toBe("false");
  });

  it("Escape does nothing while it is closed", () => {
    const el = mount(tree);
    press("Escape");
    expect(nav(el).getAttribute("data-open")).toBe("false");
  });
});

describe("PageHeader", () => {
  it("has one h1 with the title, the subtitle and the actions", () => {
    const el = mount(<PageHeader title="Orders" subtitle="Updated now" actions={<button type="button">Export</button>} />);
    expect(el.querySelectorAll("h1")).toHaveLength(1);
    expect(el.querySelector("h1")?.textContent).toBe("Orders");
    expect(el.textContent).toContain("Updated now");
    expect(el.querySelector("button")?.textContent).toBe("Export");
  });
  it("can be an h2 when the page already has its h1", () => {
    const el = mount(<PageHeader as="h2" title="Orders" />);
    expect(el.querySelectorAll("h1")).toHaveLength(0);
    expect(el.querySelector("h2")?.textContent).toBe("Orders");
  });
  it("works with a title only", () => {
    const el = mount(<PageHeader title="Zones" />);
    expect(el.querySelector("h1")?.textContent).toBe("Zones");
    expect(el.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("UserMenu", () => {
  const tree = (
    <UserMenu name="Nadia B." roleLabel="Administrator" label="Account">
      <button type="button">Sign out</button>
    </UserMenu>
  );
  it("shows the name on a button; the panel (role, actions) opens and closes with it", () => {
    const el = mount(tree);
    const trigger = el.querySelector("button") as HTMLButtonElement;
    expect(trigger.textContent).toContain("Nadia B.");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(el.textContent).not.toContain("Administrator");
    click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(el.textContent).toContain("Administrator");
    expect(el.textContent).toContain("Sign out");
    click(trigger);
    expect(el.textContent).not.toContain("Administrator");
  });
  it("Escape closes it and gives the focus back; a click outside closes it", () => {
    const el = mount(tree);
    const trigger = el.querySelector("button") as HTMLButtonElement;
    click(trigger);
    press("Escape");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    click(trigger);
    click(document.body);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
