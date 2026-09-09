/**
 * A tiny in-memory stand-in for the Admin SDK's Firestore, covering the subset
 * the routes use: document get/set, one level of subcollection, batches and
 * transactions. Parsers are tested against real formats (see
 * `src/lib/extraction/fixtures.ts`); Firestore is the one place where a double
 * is the only option, so it lives here instead of being rebuilt per test file.
 */

export interface FakeDocRef {
  id: string;
  path: string;
  get(): Promise<{ exists: boolean; id: string; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
  collection(name: string): FakeCollectionRef;
}

export interface FakeSnapshot {
  docs: { id: string; ref: FakeDocRef; data(): Record<string, unknown> }[];
}

export interface FakeQuery {
  where(field: string, op: "==", value: unknown): FakeQuery;
  get(): Promise<FakeSnapshot>;
}

export interface FakeCollectionRef extends FakeQuery {
  path: string;
  doc(id?: string): FakeDocRef;
}

export function createFakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  let autoId = 0;

  function docRef(path: string): FakeDocRef {
    const id = path.split("/").pop()!;
    return {
      id,
      path,
      async get() {
        const data = docs.get(path);
        return { exists: data !== undefined, id, data: () => data };
      },
      async set(data) {
        docs.set(path, data);
      },
      collection: (name: string) => collectionRef(`${path}/${name}`),
    };
  }

  function childEntries(path: string) {
    const prefix = `${path}/`;
    return [...docs.entries()].filter(
      // Direct children only — a deeper path belongs to a subcollection.
      ([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"),
    );
  }

  function query(
    path: string,
    filters: { field: string; value: unknown }[],
  ): FakeQuery {
    return {
      where: (field: string, _op: "==", value: unknown) =>
        query(path, [...filters, { field, value }]),
      async get() {
        const entries = childEntries(path).filter(([, data]) =>
          filters.every((filter) => data[filter.field] === filter.value),
        );
        return {
          docs: entries.map(([key, data]) => ({
            id: key.split("/").pop()!,
            ref: docRef(key),
            data: () => data,
          })),
        };
      },
    };
  }

  function collectionRef(path: string): FakeCollectionRef {
    return {
      path,
      doc: (id?: string) => docRef(`${path}/${id ?? `auto-${(autoId += 1)}`}`),
      ...query(path, []),
    };
  }

  const db = {
    collection: collectionRef,
    batch() {
      const queued: { ref: FakeDocRef; data?: Record<string, unknown> }[] = [];
      return {
        set(ref: FakeDocRef, data: Record<string, unknown>) {
          queued.push({ ref, data });
        },
        delete(ref: FakeDocRef) {
          queued.push({ ref });
        },
        async commit() {
          for (const op of queued) {
            if (op.data) docs.set(op.ref.path, op.data);
            else docs.delete(op.ref.path);
          }
        },
      };
    },
    /**
     * Mirrors the Admin SDK: removes the ref and every descendant path. The
     * tests rely on this actually clearing subcollections, since that is the
     * orphaned-page bug the delete routes exist to fix.
     */
    async recursiveDelete(ref: FakeDocRef | FakeCollectionRef) {
      const prefix = `${ref.path}/`;
      for (const key of [...docs.keys()]) {
        if (key === ref.path || key.startsWith(prefix)) docs.delete(key);
      }
    },
    async runTransaction<T>(
      handler: (transaction: {
        get(ref: FakeDocRef): ReturnType<FakeDocRef["get"]>;
        set(ref: FakeDocRef, data: Record<string, unknown>): void;
      }) => Promise<T>,
    ): Promise<T> {
      return handler({
        get: (ref) => ref.get(),
        set: (ref, data) => {
          docs.set(ref.path, data);
        },
      });
    },
  };

  return {
    db,
    docs,
    /** Every stored path under a prefix, in insertion order. */
    pathsUnder(prefix: string) {
      return [...docs.keys()].filter((key) => key.startsWith(prefix));
    },
    reset() {
      docs.clear();
      autoId = 0;
    },
  };
}

export type FakeFirestore = ReturnType<typeof createFakeFirestore>;
