// Verify both production planner paths through the site's private service binding.
if (!process.env.TICK_SECRET) throw Error('INFLIGHT_TICK_SECRET is required for the protected deployed-site routing check.');
const base = process.env.SITE || 'https://inflite-apps.georgefarrowgreen.workers.dev';
const modes = process.argv.includes('--pins') ? ['loop', 'pins'] : ['loop'];
for (const mode of modes) {
  const r = await fetch(base + '/api/routing-check', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.TICK_SECRET, 'X-Routing-Check': mode },
    signal: AbortSignal.timeout(95000)
  });
  const result = await r.json();
  console.log(JSON.stringify({ mode, status: r.status, ...result }));
  if (!r.ok || !result.ready || !result.count || (mode === 'pins' && result.orderedPins !== 2)) {
    throw Error('The deployed Fitness ' + mode + ' planner failed its private UK routing check.');
  }
}
