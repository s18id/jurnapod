import { useCallback, useEffect, useState } from "react";

export interface GuardNavigationEvent {
  target: string;
  source: "hash" | "link" | "programmatic" | "router";
  retry: () => void;
  cancel?: () => void;
}

export interface UnsavedNavigationAdapter {
  subscribe: (listener: (event: GuardNavigationEvent) => void) => () => void;
}

export interface WindowLike {
  location?: { hash?: string };
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => void;
}

export interface UnsavedChangesControllerOptions {
  isDirty: () => boolean;
  message?: string;
  windowLike?: WindowLike;
  adapter?: UnsavedNavigationAdapter;
  onAutosaveBeforeLeave?: () => Promise<void> | void;
  confirmLeave?: (message: string, event?: GuardNavigationEvent) => boolean | Promise<boolean>;
}

export interface PendingNavigation {
  event: GuardNavigationEvent;
  inFlight: boolean;
}

export class UnsavedChangesGuardController {
  private readonly getOptions: () => UnsavedChangesControllerOptions;
  private cleanupFns: Array<() => void> = [];
  pending?: PendingNavigation;

  constructor(options: UnsavedChangesControllerOptions | (() => UnsavedChangesControllerOptions)) {
    this.getOptions = typeof options === "function" ? options : () => options;
  }

  private get options(): UnsavedChangesControllerOptions {
    return this.getOptions();
  }

  mount(): void {
    const win = this.options.windowLike;
    if (win) {
      const beforeUnload = (event: Event) => {
        if (!this.options.isDirty()) return;
        event.preventDefault();
        (event as BeforeUnloadEvent).returnValue = this.message;
      };
      win.addEventListener("beforeunload", beforeUnload);
      this.cleanupFns.push(() => win.removeEventListener("beforeunload", beforeUnload));
    }
    if (this.options.adapter) {
      this.cleanupFns.push(this.options.adapter.subscribe((event) => { void this.handleNavigation(event); }));
    }
  }

  unmount(): void {
    for (const cleanup of this.cleanupFns.splice(0)) cleanup();
    this.pending = undefined;
  }

  get message(): string {
    return this.options.message ?? "You have unsaved changes. Leave this page?";
  }

  async handleNavigation(event: GuardNavigationEvent): Promise<boolean> {
    if (!this.options.isDirty()) {
      event.retry();
      return true;
    }
    this.pending = { event, inFlight: true };
    await this.options.onAutosaveBeforeLeave?.();
    const allowed = await (this.options.confirmLeave?.(this.message, event) ?? false);
    if (allowed) {
      event.retry();
      this.pending = undefined;
      return true;
    }
    event.cancel?.();
    this.pending = { event, inFlight: false };
    return false;
  }

  async confirmPending(): Promise<boolean> {
    const pending = this.pending?.event;
    if (!pending) return false;
    await this.options.onAutosaveBeforeLeave?.();
    pending.retry();
    this.pending = undefined;
    return true;
  }

  cancelPending(): void {
    this.pending?.event.cancel?.();
    this.pending = undefined;
  }
}

export interface HashNavigationAdapterOptions {
  windowLike: WindowLike;
  documentLike?: Pick<Document, "addEventListener" | "removeEventListener">;
}

export function createHashNavigationAdapter(options: HashNavigationAdapterOptions): UnsavedNavigationAdapter {
  return {
    subscribe(listener) {
      let previousHash = options.windowLike.location?.hash ?? "";
      let suppressNextHashChange = false;
      const setHashWithoutReentry = (hash: string) => {
        previousHash = hash;
        if (!options.windowLike.location || options.windowLike.location.hash === hash) return;
        suppressNextHashChange = true;
        options.windowLike.location.hash = hash;
      };
      const onHashChange = () => {
        const nextHash = options.windowLike.location?.hash ?? "";
        if (suppressNextHashChange) {
          suppressNextHashChange = false;
          previousHash = nextHash;
          return;
        }
        listener({
          source: "hash",
          target: nextHash,
          retry: () => { setHashWithoutReentry(nextHash); },
          cancel: () => {
            setHashWithoutReentry(previousHash);
          },
        });
      };
      const onClick = (event: Event) => {
        if (typeof MouseEvent !== "undefined" && event instanceof MouseEvent) {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        }
        const target = event.target as Element | null;
        const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
        const href = anchor?.getAttribute("href");
        const targetWindow = anchor?.getAttribute("target");
        if (targetWindow && targetWindow !== "_self") return;
        // This adapter can safely replay hash navigation. Do not intercept absolute
        // app paths here because replaying them requires the active app router.
        if (!href || !href.startsWith("#")) return;
        event.preventDefault();
        listener({
          source: "link",
          target: href,
          retry: () => {
            if (href.startsWith("#")) setHashWithoutReentry(href);
          },
        });
      };
      options.windowLike.addEventListener("hashchange", onHashChange);
      options.documentLike?.addEventListener("click", onClick);
      return () => {
        options.windowLike.removeEventListener("hashchange", onHashChange);
        options.documentLike?.removeEventListener("click", onClick);
      };
    },
  };
}

export interface MemoryNavigationAdapter extends UnsavedNavigationAdapter {
  navigate: (event?: Partial<GuardNavigationEvent>) => void;
  listenerCount: () => number;
}

export function createMemoryNavigationAdapter(): MemoryNavigationAdapter {
  const listeners = new Set<(event: GuardNavigationEvent) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    navigate(event = {}) {
      const navigationEvent: GuardNavigationEvent = {
        source: event.source ?? "programmatic",
        target: event.target ?? "/next",
        retry: event.retry ?? (() => undefined),
        cancel: event.cancel,
      };
      for (const listener of Array.from(listeners)) listener(navigationEvent);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

export interface UseUnsavedChangesGuardOptions {
  isDirty: boolean;
  message?: string;
  adapter?: UnsavedNavigationAdapter;
  onAutosaveBeforeLeave?: () => Promise<void> | void;
  confirmLeave?: (message: string, event?: GuardNavigationEvent) => boolean | Promise<boolean>;
  windowLike?: WindowLike;
}

export interface UseUnsavedChangesGuardResult {
  isBlocked: boolean;
  confirmLeave: () => Promise<boolean>;
  cancelLeave: () => void;
}

class MutableOptions<TOptions> {
  private current: TOptions;

  constructor(initial: TOptions) {
    this.current = initial;
  }

  get(): TOptions {
    return this.current;
  }

  set(next: TOptions): void {
    this.current = next;
  }
}

export function useUnsavedChangesGuard(options: UseUnsavedChangesGuardOptions): UseUnsavedChangesGuardResult {
  const [isBlocked, setIsBlocked] = useState(false);
  const [optionsBox] = useState(() => new MutableOptions(options));
  const [controller] = useState(() => new UnsavedChangesGuardController(() => {
      const current = optionsBox.get();
      return {
        isDirty: () => current.isDirty,
        message: current.message,
        adapter: current.adapter,
        windowLike: current.windowLike ?? (typeof window === "undefined" ? undefined : window),
        onAutosaveBeforeLeave: current.onAutosaveBeforeLeave,
        confirmLeave: async (_message, _event) => {
          if (current.confirmLeave) return current.confirmLeave(_message, _event);
          setIsBlocked(true);
          return false;
        },
      };
    }));

  useEffect(() => {
    optionsBox.set(options);
  }, [options, optionsBox]);

  useEffect(() => {
    controller.mount();
    return () => { controller.unmount(); };
  }, [controller]);

  const confirmPending = useCallback(async () => {
    const allowed = await controller.confirmPending();
    setIsBlocked(false);
    return allowed;
  }, [controller]);

  const cancelPending = useCallback(() => {
    controller.cancelPending();
    setIsBlocked(false);
  }, [controller]);

  return { isBlocked, confirmLeave: confirmPending, cancelLeave: cancelPending };
}
