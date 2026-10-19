// Stand-ins for where official warnings come from (functions/_wxwarn.js), made for the time they're asked for.
// MeteoAlarm's UK feed: over London, a yellow rain warning in force (an update: the one it replaced mustn't show)
// and an amber thunderstorm warning tomorrow; over Bristol, a yellow wind warning in force; and some that mustn't
// show anywhere: over, green ("nothing in particular"), cancelled, and one without a drawn area. And the National
// Weather Service's alerts for a point in New York: a wind advisory in force (and one over, one cancelled, a test).
const H = 3600e3, D = 24 * H;
const box = (s, w, n, e) => `${s},${w} ${s},${e} ${n},${e} ${n},${w} ${s},${w}`;
export const LONDON = box(51.3, -0.5, 51.7, 0.3), BRISTOL = box(51.35, -2.75, 51.55, -2.45);
const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, '+00:00');

function alert(id, { msgType = 'Alert', status = 'Actual', references = null, level = '2; yellow; Moderate', type = '1; Wind', event, onset, expires, polygon = LONDON,
  headline = null, description = '', instruction = '', impacts = [], area = 'London & South East England' }) {
  return {
    uuid: `u-${id}`,
    alert: {
      identifier: id, msgType, status, scope: 'Public', sender: 'https://www.metoffice.gov.uk', sent: iso(onset), ...(references ? { references } : {}),
      info: [{
        language: 'en-GB', category: ['Met'], event, severity: 'Moderate', certainty: 'Likely', urgency: 'Future', responseType: ['Prepare'],
        onset: iso(onset), expires: iso(expires), headline, description, instruction, senderName: 'UK Met Office', web: 'https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings',
        parameter: [{ valueName: 'awareness_level', value: level }, { valueName: 'awareness_type', value: type }, ...impacts.map((value) => ({ valueName: 'impacts', value }))],
        area: [{ areaDesc: area, ...(polygon ? { polygon: [polygon] } : { geocode: [{ valueName: 'EMMA_ID', value: 'UK001' }] }) }],
      }],
    },
  };
}
export function ukFeed(now = Date.now()) {
  const day = Math.floor(now / D) * D;
  return {
    warnings: [
      alert('ldn-rain', { msgType: 'Update', references: 'https://www.metoffice.gov.uk,ldn-rain-old,2026-01-01T00:00:00+00:00', type: '10; Rain', event: 'Yellow rain warning', onset: now - H, expires: now + 5 * H,
        headline: 'Heavy rain may lead to some flooding and travel disruption.', description: 'Rain will turn heavy this afternoon.\n\nFor further details see the Met Office website.',
        instruction: 'Check road conditions\nbefore you travel.', impacts: ['Spray and flooding could make journeys longer', 'Some interruption to power is possible'] }),
      alert('ldn-rain-old', { type: '10; Rain', event: 'Yellow rain warning', onset: now - 2 * H, expires: now + 3 * H, headline: 'An earlier rain warning.' }),
      alert('ldn-storm', { level: '3; orange; Severe', type: '3; Thunderstorm', event: 'Amber thunderstorm warning', onset: day + 36 * H, expires: day + 45 * H, headline: 'Thunderstorms could bring flooding.' }),
      alert('ldn-over', { type: '4; Fog', event: 'Yellow fog warning', onset: now - 9 * H, expires: now - H }),
      alert('ldn-green', { level: '1; green; Minor', event: 'Minor wind', onset: now - H, expires: now + 5 * H }),
      alert('ldn-cancel', { msgType: 'Cancel', event: 'Yellow wind warning', onset: now - H, expires: now + 5 * H }),
      alert('ldn-nomap', { type: '2; snow-ice', event: 'Yellow snow warning', onset: now - H, expires: now + 5 * H, polygon: null }),
      alert('brs-wind', { event: 'Yellow wind warning', onset: now - H / 2, expires: now + 8 * H, polygon: BRISTOL, area: 'South West England', headline: 'Strong winds may cause some disruption.' }),
      // (the same warning again under another name, as some services issue them: shown once)
      alert('brs-wind-again', { event: 'Yellow wind warning', onset: now - H / 2, expires: now + 8 * H, polygon: BRISTOL, area: 'South West England', headline: 'Strong winds may cause some disruption.' }),
    ],
  };
}

export const NEW_YORK = '40.71,-74.01';
export function nwsAlerts(now = Date.now()) {
  const f = (id, o = {}) => ({
    type: 'Feature',
    properties: {
      id, status: 'Actual', messageType: 'Alert', severity: 'Moderate', certainty: 'Likely', urgency: 'Expected', event: 'Wind Advisory', senderName: 'NWS Upton NY',
      headline: 'Wind Advisory issued October 19 at 3:00AM EDT until October 19 at 6:00PM EDT by NWS Upton NY',
      description: '* WHAT...West winds 20 to 30 mph\nwith gusts up to 50 mph.\n\n* WHERE...New York (Manhattan).', instruction: 'Use extra caution when driving.',
      onset: iso(now - H), effective: iso(now - H), ends: iso(now + 6 * H), expires: iso(now + 6 * H), areaDesc: 'New York (Manhattan)',
      parameters: { NWSheadline: ['WIND ADVISORY IN EFFECT UNTIL 6 PM EDT THIS EVENING'] }, ...o,
    },
  });
  return { type: 'FeatureCollection', features: [f('nws-1'), f('nws-over', { ends: iso(now - H), expires: iso(now - H) }), f('nws-cancel', { messageType: 'Cancel' }), f('nws-test', { status: 'Test' })] };
}
