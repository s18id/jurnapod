import { useMemo, useState } from "react";

import { createHashNavigationAdapter, createMemoryNavigationAdapter, useUnsavedChangesGuard } from "../src/hooks/useUnsavedChangesGuard";

function GuardDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div role="dialog" aria-label="Unsaved changes guard">
      <p>You have unsaved changes.</p>
      <button type="button" onClick={onStay}>Stay</button>
      <button type="button" onClick={onLeave}>Leave</button>
    </div>
  );
}

export function HashGuardHarness() {
  const originalAmount = "10.00";
  const [amount, setAmount] = useState(originalAmount);
  const adapter = useMemo(() => createHashNavigationAdapter({ windowLike: window, documentLike: document }), []);
  const guard = useUnsavedChangesGuard({ isDirty: amount !== originalAmount, adapter });

  return (
    <div>
      <label htmlFor="hash-amount">Amount</label>
      <input id="hash-amount" value={amount} onChange={(event) => setAmount(event.currentTarget.value)} />
      <a href="#linked-target">Linked hash target</a>
      <button type="button" onClick={() => { window.location.hash = "#direct-target"; }}>Direct hash target</button>
      {guard.isBlocked ? (
        <GuardDialog
          onStay={guard.cancelLeave}
          onLeave={() => { void guard.confirmLeave(); }}
        />
      ) : null}
    </div>
  );
}

export function MemoryGuardHarness() {
  const [route, setRoute] = useState("/current");
  const adapter = useMemo(() => createMemoryNavigationAdapter(), []);
  const guard = useUnsavedChangesGuard({ isDirty: true, adapter });

  return (
    <div>
      <p aria-label="Current route">{route}</p>
      <button
        type="button"
        onClick={() => adapter.navigate({
          target: "/custom-target",
          source: "router",
          retry: () => setRoute("/custom-target"),
          cancel: () => setRoute("/current"),
        })}
      >
        Custom route target
      </button>
      {guard.isBlocked ? (
        <GuardDialog
          onStay={guard.cancelLeave}
          onLeave={() => { void guard.confirmLeave(); }}
        />
      ) : null}
    </div>
  );
}
