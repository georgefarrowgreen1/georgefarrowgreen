// A Worker can serve overlapping requests in one isolate. Cache completed setup by
// database binding. Only callers inside the same request may await its pending I/O.
const requestSchema = Symbol("request schema setup");

export function schemaContext(ctx) {
  const scope = { database: ctx.env.DB, pending: new Map() };
  return { ...ctx, env: { ...ctx.env, [requestSchema]: scope } };
}

export function schemaSetup(setup) {
  const completed = new WeakMap();
  return async function ensure(env) {
    const database = env.DB;
    if (completed.has(database)) return completed.get(database);
    const scope = env[requestSchema];
    const pending = scope && scope.database === database ? scope.pending : undefined;
    if (pending?.has(setup)) return pending.get(setup);
    const work = setup(env).then(value => {
      // Concurrent requests may both finish. Keep the first completed metadata.
      if (!completed.has(database)) completed.set(database, value);
      return completed.get(database);
    });
    pending?.set(setup, work);
    try {
      return await work;
    } finally {
      pending?.delete(setup);
    }
  };
}

// Re-running a column migration is safe. A different database error must leave setup retryable.
export function ignoreDuplicateColumn(error) {
  if (!/duplicate column name/i.test(error?.cause?.message || error?.message || "")) throw error;
}
