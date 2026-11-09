export type AuditEntry = {
  seq: number;
  at: string;
  role: string;
  action: string;
  entity: string;
  detail: string;
  prev: string;
  hash: string;
};

export const genesis = "0".repeat(64);

const payload = (e: Omit<AuditEntry, "hash">) =>
  JSON.stringify([e.seq, e.at, e.role, e.action, e.entity, e.detail, e.prev]);

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds the next entry; each hash covers the previous hash, so editing any entry breaks every later link. */
export async function nextEntry(
  previous: AuditEntry | undefined,
  event: Pick<AuditEntry, "role" | "action" | "entity" | "detail"> & { at?: string },
): Promise<AuditEntry> {
  const base = {
    seq: (previous?.seq ?? 0) + 1,
    at: event.at ?? new Date().toISOString(),
    role: event.role,
    action: event.action,
    entity: event.entity,
    detail: event.detail,
    prev: previous?.hash ?? genesis,
  };
  return { ...base, hash: await sha256(payload(base)) };
}

/** Verifies a chain stored oldest-first. Returns the first broken sequence number, if any. */
export async function verifyChain(entries: AuditEntry[]) {
  let prev = genesis;
  for (const entry of entries) {
    const { hash, ...rest } = entry;
    if (entry.prev !== prev || (await sha256(payload(rest))) !== hash)
      return { ok: false as const, checked: entries.length, brokenAt: entry.seq };
    prev = hash;
  }
  return { ok: true as const, checked: entries.length };
}
