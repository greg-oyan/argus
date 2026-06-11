import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { CutoutErrorFallback, ErrorBoundary, RouteErrorFallback } from "./ErrorBoundary";

// The default test environment has no DOM (and the project adds no test-only
// dependencies), so these tests drive the boundary class through the exact
// lifecycle React uses when a child throws: getDerivedStateFromError -> state
// -> render, plus the reset paths. DOM-mounted coverage of "the app survives
// a crash" lives in the Playwright smoke suite.

function collectElements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, out);
    return out;
  }
  if (isValidElement(node)) {
    out.push(node);
    collectElements((node.props as { children?: ReactNode }).children, out);
  }
  return out;
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function findButton(root: ReactNode, label: string): ReactElement | undefined {
  return collectElements(root).find(
    (element) => element.type === "button" && textOf(element).includes(label),
  );
}

type BoundaryProps = ConstructorParameters<typeof ErrorBoundary>[0];

// Instantiate the class with a synchronous setState so state transitions can
// be asserted without a React renderer.
function instantiate(props: BoundaryProps): ErrorBoundary {
  const instance = new ErrorBoundary(props);
  Object.assign(instance, {
    setState: (update: Partial<{ error: Error | null }>) => {
      instance.state = { ...instance.state, ...update };
    },
  });
  return instance;
}

describe("ErrorBoundary", () => {
  const children = "healthy child content";

  it("renders children when nothing has thrown", () => {
    const instance = instantiate({ children, fallback: () => "fallback" });
    expect(instance.render()).toBe(children);
  });

  it("derives error state from a throwing child and renders the fallback", () => {
    const thrown = new Error("child render exploded");
    // This is exactly what React calls when a descendant throws in render.
    expect(ErrorBoundary.getDerivedStateFromError(thrown)).toEqual({ error: thrown });

    const fallback = vi.fn(() => "fallback ui");
    const instance = instantiate({ children, fallback });
    instance.state = { error: thrown };
    expect(instance.render()).toBe("fallback ui");
    expect(fallback).toHaveBeenCalledWith(expect.any(Function));
  });

  it("logs the error with the component stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const instance = instantiate({ children, fallback: () => null });
    const thrown = new Error("boom");
    instance.componentDidCatch(thrown, { componentStack: "\n  at StorySkyCutout" });
    expect(spy).toHaveBeenCalledWith("Argus view crashed:", thrown, "\n  at StorySkyCutout");
    spy.mockRestore();
  });

  it("reset() clears the error so children render again", () => {
    const instance = instantiate({ children, fallback: () => "fallback ui" });
    instance.state = { error: new Error("boom") };
    expect(instance.render()).toBe("fallback ui");
    instance.reset();
    expect(instance.state.error).toBeNull();
    expect(instance.render()).toBe(children);
  });

  it("clears the error when resetKey changes (route navigation recovers)", () => {
    const instance = instantiate({ children, fallback: () => null, resetKey: "case:B" });
    instance.state = { error: new Error("boom") };
    instance.componentDidUpdate({ children, fallback: () => null, resetKey: "case:A" });
    expect(instance.state.error).toBeNull();
  });

  it("keeps the error when resetKey is unchanged", () => {
    const thrown = new Error("boom");
    const instance = instantiate({ children, fallback: () => null, resetKey: "case:A" });
    instance.state = { error: thrown };
    instance.componentDidUpdate({ children, fallback: () => null, resetKey: "case:A" });
    expect(instance.state.error).toBe(thrown);
  });
});

describe("RouteErrorFallback", () => {
  it("shows the message and recovers via Back to the sky", () => {
    const onBackToSky = vi.fn();
    const tree = RouteErrorFallback({ onBackToSky });

    expect(textOf(tree)).toContain("Something went wrong rendering this view.");

    const backButton = findButton(tree, "Back to the sky");
    expect(backButton).toBeDefined();
    (backButton?.props as { onClick: () => void }).onClick();
    expect(onBackToSky).toHaveBeenCalledTimes(1);

    expect(findButton(tree, "Reload")).toBeDefined();
  });

  it("wired into the boundary: clicking Back to the sky resets to children", () => {
    const onBackToSky = vi.fn();
    let resetFn: (() => void) | null = null;
    const instance = instantiate({
      children: "the sky view",
      fallback: (reset) => {
        resetFn = reset;
        return RouteErrorFallback({
          onBackToSky: () => {
            onBackToSky();
            reset();
          },
        });
      },
    });
    instance.state = { error: new Error("view crashed") };

    const fallbackTree = instance.render();
    expect(textOf(fallbackTree as ReactNode)).toContain("Something went wrong rendering this view.");
    expect(resetFn).not.toBeNull();

    const backButton = findButton(fallbackTree as ReactNode, "Back to the sky");
    (backButton?.props as { onClick: () => void }).onClick();

    expect(onBackToSky).toHaveBeenCalledTimes(1);
    expect(instance.state.error).toBeNull();
    expect(instance.render()).toBe("the sky view");
  });
});

describe("CutoutErrorFallback", () => {
  it("uses the cutout's existing failure-state copy", () => {
    expect(textOf(CutoutErrorFallback())).toContain(
      "Sky imagery couldn't load — it streams from an external astronomy service.",
    );
  });
});
