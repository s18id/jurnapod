import { describe, expect, it } from "vitest";

import {
  REVIEW_PANEL_DRAFT_SCHEMA_VERSION,
  cleanupDraftsForScope,
  cleanupExpiredDrafts,
  createStoredDraft,
  getClientDraftEpochMs,
  makeDraftStorageKey,
  parseStoredDraft,
  resolveStorageConflict,
  sanitizeDraftPayload,
  saveDraft,
  type StorageLike,
} from "@/hooks/useFormAutosave";

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  failWrites: "quota" | "disabled" | undefined;

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites === "quota") {
      const error = new Error("full");
      error.name = "QuotaExceededError";
      throw error;
    }
    if (this.failWrites === "disabled") throw new Error("disabled");
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const scope = {
  companyId: 10,
  userId: 20,
  outletId: 30,
  formType: "ap-invoice",
  draftId: "draft-a",
};

describe("useFormAutosave helpers", () => {
  it("uses the required user/company/outlet/form/entity draft key format", () => {
    expect(makeDraftStorageKey(scope)).toBe("jp:draft:v1:10:20:30:ap-invoice:draft-a");
    expect(makeDraftStorageKey({ ...scope, outletId: undefined, entityId: "existing", draftId: undefined })).toBe("jp:draft:v1:10:20:global:ap-invoice:existing");
    expect(makeDraftStorageKey({ ...scope, draftId: "draft:with:colon" })).toBe("jp:draft:v1:10:20:30:ap-invoice:draft%3Awith%3Acolon");
  });

  it("uses a client performance clock helper for draft epoch milliseconds", () => {
    expect(Number.isFinite(getClientDraftEpochMs())).toBe(true);
  });

  it("stores metadata and strips secrets, tokens, passwords, files, and attachments", () => {
    const draft = createStoredDraft({
      scope,
      nowMs: 1000,
      payload: {
        amount: "100.50",
        password: "nope",
        accessToken: "nope",
        attachment: { name: "invoice.pdf" },
        nested: { secretNote: "nope", memo: "ok" },
      },
    });

    expect(draft.metadata).toMatchObject({ ...scope, schemaVersion: REVIEW_PANEL_DRAFT_SCHEMA_VERSION, createdAt: 1000, updatedAt: 1000 });
    expect(draft.payload).toEqual({ amount: "100.50", nested: { memo: "ok" } });
  });

  it("rejects TTL-expired, schema-mismatched, scope-mismatched, and malformed drafts", () => {
    const draft = createStoredDraft({ scope, nowMs: 1000, payload: { amount: "1.00" } });
    const raw = JSON.stringify(draft);

    expect(parseStoredDraft(raw, { scope, nowMs: 1001 }).draft).toBeDefined();
    expect(parseStoredDraft(raw, { scope, nowMs: 1000 + 8 * 24 * 60 * 60 * 1000 }).warning?.code).toBe("expired");
    expect(parseStoredDraft(raw, { scope: { ...scope, userId: 21 }, nowMs: 1001 }).warning?.code).toBe("mismatch");
    expect(parseStoredDraft(raw, { scope, schemaVersion: "v2", nowMs: 1001 }).warning?.code).toBe("mismatch");
    expect(parseStoredDraft("{broken", { scope, nowMs: 1001 }).warning?.code).toBe("malformed");
  });

  it("cleans up drafts on submit success, logout, company switch, outlet switch, and discard by exposed scope cleanup", () => {
    const storage = new MemoryStorage();
    const keyA = makeDraftStorageKey(scope);
    const keyB = makeDraftStorageKey({ ...scope, draftId: "draft-b", outletId: 31 });
    storage.setItem(keyA, JSON.stringify(createStoredDraft({ scope, nowMs: 1000, payload: { a: true } })));
    storage.setItem(keyB, JSON.stringify(createStoredDraft({ scope: { ...scope, draftId: "draft-b", outletId: 31 }, nowMs: 1000, payload: { b: true } })));

    expect(cleanupDraftsForScope(storage, { companyId: 10, userId: 20, outletId: 30 })).toBe(1);
    expect(storage.getItem(keyA)).toBeNull();
    expect(storage.getItem(keyB)).not.toBeNull();
    expect(cleanupDraftsForScope(storage, { companyId: 10, userId: 20 })).toBe(1);
  });

  it("handles quota exceeded and localStorage disabled as non-blocking warnings", () => {
    const storage = new MemoryStorage();
    const draft = createStoredDraft({ scope, nowMs: 1000, payload: { amount: "1.00" } });
    storage.failWrites = "quota";
    expect(saveDraft(storage, makeDraftStorageKey(scope), draft, 1000)?.code).toBe("quota");
    storage.failWrites = "disabled";
    expect(saveDraft(storage, makeDraftStorageKey(scope), draft, 1000)?.code).toBe("disabled");
  });

  it("removes expired or malformed draft records before retrying quota cleanup", () => {
    const storage = new MemoryStorage();
    const expiredKey = makeDraftStorageKey({ ...scope, draftId: "expired" });
    storage.setItem(expiredKey, JSON.stringify(createStoredDraft({ scope: { ...scope, draftId: "expired" }, nowMs: 1, payload: {} })));
    storage.setItem("jp:draft:v1:bad", "{broken");

    expect(cleanupExpiredDrafts(storage, 10 * 24 * 60 * 60 * 1000)).toBe(2);
  });

  it("resolves multi-tab storage conflicts by newest metadata timestamp", () => {
    const current = createStoredDraft({ scope, nowMs: 1000, payload: { amount: "1.00" } });
    const older = createStoredDraft({ scope, nowMs: 999, payload: { amount: "2.00" } });
    const newer = createStoredDraft({ scope, nowMs: 1001, payload: { amount: "3.00" } });

    expect(resolveStorageConflict(current, older)).toBe("keep-current");
    expect(resolveStorageConflict(current, newer)).toBe("accept-incoming");
  });

  it("rejects circular JSON-only payloads", () => {
    const payload: Record<string, unknown> = { amount: "1.00" };
    payload.self = payload;
    expect(() => sanitizeDraftPayload(payload)).toThrow("circular");
  });
});
