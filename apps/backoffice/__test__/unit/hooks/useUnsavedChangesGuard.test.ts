import * as React from "react";
import { describe, expect, it } from "vitest";

import {
  UnsavedChangesGuardController,
  createHashNavigationAdapter,
  createMemoryNavigationAdapter,
  useUnsavedChangesGuard,
  type UseUnsavedChangesGuardOptions,
  type WindowLike,
} from "@/hooks/useUnsavedChangesGuard";

type EffectRecord = {
  deps?: unknown[];
  cleanup?: () => void;
  create?: () => void | (() => void);
  changed: boolean;
};

function depsChanged(previous: unknown[] | undefined, next: unknown[] | undefined): boolean {
  if (!previous || !next || previous.length !== next.length) return true;
  return next.some((value, index) => !Object.is(value, previous[index]));
}

function createHookRunner<TResult>(renderHook: () => TResult) {
  const internals = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const states: unknown[] = [];
  const effects: EffectRecord[] = [];
  let stateIndex = 0;
  let effectIndex = 0;

  const dispatcher = {
    useState<TValue>(initial: TValue | (() => TValue)): [TValue, (next: TValue | ((current: TValue) => TValue)) => void] {
      const index = stateIndex;
      stateIndex += 1;
      if (!(index in states)) states[index] = typeof initial === "function" ? (initial as () => TValue)() : initial;
      return [states[index] as TValue, (next) => {
        states[index] = typeof next === "function" ? (next as (current: TValue) => TValue)(states[index] as TValue) : next;
      }];
    },
    useRef<TValue>(initial: TValue): { current: TValue } {
      const index = stateIndex;
      stateIndex += 1;
      if (!(index in states)) states[index] = { current: initial };
      return states[index] as { current: TValue };
    },
    useEffect(create: () => void | (() => void), deps?: unknown[]): void {
      const index = effectIndex;
      effectIndex += 1;
      const previous = effects[index];
      const changed = depsChanged(previous?.deps, deps);
      effects[index] = { deps, cleanup: previous?.cleanup, create, changed };
    },
    useCallback<TCallback extends (...args: never[]) => unknown>(callback: TCallback): TCallback {
      return callback;
    },
  };

  function render(): TResult {
    stateIndex = 0;
    effectIndex = 0;
    const previousDispatcher = internals.ReactCurrentDispatcher.current;
    internals.ReactCurrentDispatcher.current = dispatcher;
    try {
      const result = renderHook();
      for (const effect of effects) {
        if (!effect.changed || !effect.create) continue;
        effect.cleanup?.();
        const cleanup = effect.create();
        effect.cleanup = typeof cleanup === "function" ? cleanup : undefined;
        effect.changed = false;
      }
      return result;
    } finally {
      internals.ReactCurrentDispatcher.current = previousDispatcher;
    }
  }

  function cleanup(): void {
    for (const effect of effects) effect.cleanup?.();
  }

  return { render, cleanup };
}

class FakeWindow implements WindowLike {
  location = { hash: "#start" };
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, new Set([...(this.listeners.get(type) ?? []), listener]));
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener);
  }

  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
  }
}

class FakeDocument {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, new Set([...(this.listeners.get(type) ?? []), listener]));
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
  }
}

function attachAnchorTarget(event: Event, href: string, target?: string): void {
  Object.defineProperty(event, "target", {
    value: {
      closest: () => ({
        getAttribute: (name: string) => {
          if (name === "href") return href;
          if (name === "target") return target ?? null;
          return null;
        },
      }),
    },
  });
}

describe("useUnsavedChangesGuard controller", () => {
  it("blocks dirty programmatic navigation, awaits in-flight autosave, then proceeds when confirmed", async () => {
    const adapter = createMemoryNavigationAdapter();
    const calls: string[] = [];
    const controller = new UnsavedChangesGuardController({
      isDirty: () => true,
      adapter,
      onAutosaveBeforeLeave: async () => { calls.push("autosave"); },
      confirmLeave: () => {
        calls.push("confirm");
        return true;
      },
    });
    controller.mount();

    await controller.handleNavigation({ source: "programmatic", target: "/next", retry: () => calls.push("retry") });

    expect(calls).toEqual(["autosave", "confirm", "retry"]);
    controller.unmount();
  });

  it("does not block navigation when a touched form is reverted to original values", async () => {
    let current = { amount: "1.00" };
    const original = { amount: "1.00" };
    const calls: string[] = [];
    const controller = new UnsavedChangesGuardController({
      isDirty: () => JSON.stringify(current) !== JSON.stringify(original),
      confirmLeave: () => false,
    });

    current = { amount: "2.00" };
    current = { amount: "1.00" };
    await controller.handleNavigation({ source: "programmatic", target: "/next", retry: () => calls.push("retry") });

    expect(calls).toEqual(["retry"]);
  });

  it("registers beforeunload protection and removes listeners on unmount", () => {
    const fakeWindow = new FakeWindow();
    const controller = new UnsavedChangesGuardController({ isDirty: () => true, windowLike: fakeWindow });
    controller.mount();
    expect(fakeWindow.count("beforeunload")).toBe(1);

    const event = new Event("beforeunload", { cancelable: true });
    fakeWindow.dispatch("beforeunload", event);
    expect(event.defaultPrevented).toBe(true);

    controller.unmount();
    expect(fakeWindow.count("beforeunload")).toBe(0);
  });

  it("supports active hash navigation adapter and cleanup", () => {
    const fakeWindow = new FakeWindow();
    const adapter = createHashNavigationAdapter({ windowLike: fakeWindow });
    const targets: string[] = [];
    const unsubscribe = adapter.subscribe((event) => targets.push(`${event.source}:${event.target}`));

    fakeWindow.location.hash = "#changed";
    fakeWindow.dispatch("hashchange", new Event("hashchange"));

    expect(targets).toEqual(["hash:#changed"]);
    expect(fakeWindow.count("hashchange")).toBe(1);
    unsubscribe();
    expect(fakeWindow.count("hashchange")).toBe(0);
  });

  it("does not block modifier-click, middle-click, or target=_blank links", () => {
    const originalMouseEvent = globalThis.MouseEvent;
    class TestMouseEvent extends Event {
      button: number;
      metaKey: boolean;
      ctrlKey: boolean;
      shiftKey: boolean;
      altKey: boolean;

      constructor(init: { button?: number; metaKey?: boolean } = {}) {
        super("click", { cancelable: true });
        this.button = init.button ?? 0;
        this.metaKey = init.metaKey ?? false;
        this.ctrlKey = false;
        this.shiftKey = false;
        this.altKey = false;
      }
    }
    Object.defineProperty(globalThis, "MouseEvent", { configurable: true, value: TestMouseEvent });
    const fakeWindow = new FakeWindow();
    const fakeDocument = new FakeDocument();
    const targets: string[] = [];
    const unsubscribe = createHashNavigationAdapter({ windowLike: fakeWindow, documentLike: fakeDocument }).subscribe((event) => targets.push(event.target));

    const middleClick = new TestMouseEvent({ button: 1 });
    attachAnchorTarget(middleClick, "/target");
    fakeDocument.dispatch("click", middleClick);
    const modifierClick = new TestMouseEvent({ metaKey: true });
    attachAnchorTarget(modifierClick, "/target");
    fakeDocument.dispatch("click", modifierClick);
    const blankClick = new TestMouseEvent();
    attachAnchorTarget(blankClick, "/target", "_blank");
    fakeDocument.dispatch("click", blankClick);

    expect(targets).toEqual([]);
    expect(middleClick.defaultPrevented).toBe(false);
    expect(modifierClick.defaultPrevented).toBe(false);
    expect(blankClick.defaultPrevented).toBe(false);
    unsubscribe();
    Object.defineProperty(globalThis, "MouseEvent", { configurable: true, value: originalMouseEvent });
  });

  it("does not swallow non-hash internal path links", () => {
    const fakeWindow = new FakeWindow();
    const fakeDocument = new FakeDocument();
    const targets: string[] = [];
    const unsubscribe = createHashNavigationAdapter({ windowLike: fakeWindow, documentLike: fakeDocument }).subscribe((event) => targets.push(event.target));

    const event = new Event("click", { cancelable: true });
    attachAnchorTarget(event, "/purchasing/suppliers");
    fakeDocument.dispatch("click", event);

    expect(targets).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
    unsubscribe();
  });

  it("cancels pending navigation when user chooses to stay", async () => {
    const calls: string[] = [];
    const controller = new UnsavedChangesGuardController({
      isDirty: () => true,
      onAutosaveBeforeLeave: () => calls.push("autosave"),
      confirmLeave: () => false,
    });

    const allowed = await controller.handleNavigation({
      source: "programmatic",
      target: "/next",
      retry: () => calls.push("retry"),
      cancel: () => calls.push("cancel"),
    });

    expect(allowed).toBe(false);
    expect(calls).toEqual(["autosave", "cancel"]);
    expect(controller.pending?.inFlight).toBe(false);
    controller.cancelPending();
    expect(controller.pending).toBeUndefined();
  });

  it("memory adapter removes navigation listeners", () => {
    const adapter = createMemoryNavigationAdapter();
    const controller = new UnsavedChangesGuardController({ isDirty: () => true, adapter });
    controller.mount();
    expect(adapter.listenerCount()).toBe(1);
    controller.unmount();
    expect(adapter.listenerCount()).toBe(0);
  });

  it("keeps pending hook navigation stable across blocked-state re-render before confirm", async () => {
    const adapter = createMemoryNavigationAdapter();
    const calls: string[] = [];
    let options: UseUnsavedChangesGuardOptions = {
      isDirty: true,
      adapter,
      onAutosaveBeforeLeave: () => calls.push("autosave"),
    };
    const runner = createHookRunner(() => useUnsavedChangesGuard(options));
    let result = runner.render();

    adapter.navigate({ retry: () => calls.push("retry") });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    options = { ...options };
    result = runner.render();
    expect(result.isBlocked).toBe(true);

    await result.confirmLeave();
    result = runner.render();

    expect(calls).toEqual(["autosave", "autosave", "retry"]);
    expect(result.isBlocked).toBe(false);
    runner.cleanup();
  });
});
