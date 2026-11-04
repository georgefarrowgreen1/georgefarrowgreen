// Precision Fit Studio: Pedal Revolution's bike-fit form (fitting.georgefarrowgreen.com, functions/_fitstudio.js).
// One page for the fitter on an iPad: the session, the rider interview, the off- and on-bike assessments, the bike's
// measurements before and after, photos with angles marked on them, then the client's report as a PDF to share or
// download. Every fit is kept in this browser (IndexedDB) and nowhere else: the page has no API.
'use strict';
const LOGO = document.querySelector('.top img').src;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const isNum = x => typeof x === 'number' && isFinite(x);
const ICON_TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ---------------- fit types (from pedalrevolution.co.uk/bike-fit) ---------------- */
const FITS = {
  std: {code:'S', name:'Standard Fit', price:'£150', time:'1.5–2 hrs', who:'Injury-free riders: new to cycling, first road bike, or just switched to cleats.',
        incl:['Rider interview','Partial physical & postural assessment','Saddle, cleat & cockpit set-up','Motion capture','Fit report','Follow-up appointment £25']},
  full:{code:'F', name:'Full Precision Fit', price:'£300', time:'3–5 hrs', who:'Comfort and performance gains, on-bike discomfort, or past and current injuries.',
        incl:['Full assessment: symmetry, alignment, mobility, stability','Foot mapping & cleat alignment','Crank length recommendation','Motion capture','Pre- & post-fit photos','Electronic fit report','Free 30-min follow-up at 8 weeks']},
  tt:  {code:'T', name:'TT & Triathlon Fit', price:'POA', time:'4–5 hrs', who:'Time trial and triathlon bikes: an aero position the rider can hold and still pedal well.',
        incl:['Everything in the Full Precision Fit','Aero pad stack, reach & width','Extension length & angle','Aero sustainability check','UCI position check','Free 30-min follow-up at 8 weeks']}
};
const FITTERS = ['Kate', 'Matt'];
/* Guide ranges are studio defaults: change them here to match how you fit. */
const TARGETS = {
  legExt:{road:[138,148], tt:[138,148]}, hipTop:{road:[45,60], tt:[40,50]}, torso:{road:[35,50], tt:[5,20]},
  shoulder:{road:[80,95], tt:[80,100]}, elbow:{road:[150,165], tt:[85,105]}, kops:{road:[-1,1], tt:[-1,3]}
};
const CL = {
  ham:  {txt:{r:'<45°', y:'45–70°', g:'>70°'}, fn:v => v < 45 ? 'r' : v <= 70 ? 'y' : 'g'},
  hip:  {txt:{r:'>80°', y:'60–80°', g:'<60°'}, fn:v => v > 80 ? 'r' : v >= 60 ? 'y' : 'g'},
  back: {txt:{r:'<30°', y:'30–60°', g:'>60°'}, fn:v => v < 30 ? 'r' : v <= 60 ? 'y' : 'g'},
  plank:{txt:{r:'<30 s', y:'30–90 s', g:'>90 s'}, fn:v => v < 30 ? 'r' : v <= 90 ? 'y' : 'g'},
};
const CNAME = {r:'Red', y:'Yellow', g:'Green', b:'Blue'};

/* ---------------- field helpers ---------------- */
const T  = (k, label, o = {}) => ({t:'text', k, label, ...o});
const N  = (k, label, unit, o = {}) => ({t:'num', k, label, unit, ...o});
const SG = (k, label, opts, o = {}) => ({t:'seg', k, label, opts, ...o});
const CH = (k, label, opts, o = {}) => ({t:'chips', k, label, opts, ...o});
const TA = (k, label, o = {}) => ({t:'area', k, label, wide:true, ...o});
const LT = (k, label, unit, cl, o = {}) => ({t:'light', k, label, unit, cl, ...o});
const AN = (k, label, unit, o = {}) => ({t:'angle', k, label, unit, ...o});
const CK = (k, items, o = {}) => ({t:'check', k, items, wide:true, ...o});

const PAIN = {neck:'Neck', shoulder_L:'Left shoulder', shoulder_R:'Right shoulder', back:'Upper back', lowback:'Lower back', arm_L:'Left arm', arm_R:'Right arm',
  hand_L:'Left hand', hand_R:'Right hand', hip_L:'Left hip', hip_R:'Right hip', saddle:'Saddle contact', leg_L:'Left leg', leg_R:'Right leg',
  knee_L:'Left knee', knee_R:'Right knee', foot_L:'Left foot', foot_R:'Right foot'};

// (S Standard, F Full: a road bike's; T: a TT or triathlon bike's, as Precision Fit's triathlon form lists them)
const BIKE = [
  // (the road form's order and names: saddle 1–6, reach and drop 7–9, cockpit 10–13, crank 14, coordinates 15–18)
  {g:'Saddle', k:'sadH', label:'Saddle height', u:'mm', hint:'BB centre to top of saddle'},
  {g:'Saddle', k:'sadModel', label:'Saddle model', t:'text'},
  {g:'Saddle', k:'sadW', label:'Saddle size', u:'mm', step:5, hint:'Width'},
  {g:'Saddle', k:'tilt', label:'Saddle tilt', u:'°', step:0.5},
  {g:'Saddle', k:'setback', label:'Saddle setback', u:'mm', hint:'Saddle tip behind BB'},
  {g:'Saddle', k:'postOff', label:'Seat post offset', u:'mm', step:5, f:'F'},
  {g:'Reach & drop', k:'tipBar', label:'Saddle tip to bar', u:'mm', step:5, f:'F'},
  {g:'Reach & drop', k:'tipShifter', label:'Saddle tip to shifter', u:'mm', step:5, f:'F'},
  {g:'Reach & drop', k:'barReach', label:'Saddle to bar reach', u:'mm', step:5, f:'F'},
  {g:'Reach & drop', k:'hoods', label:'Saddle to hoods reach', u:'mm', step:5, f:'F'},
  {g:'Reach & drop', k:'drop', label:'Saddle to bar drop', u:'mm', step:5, f:'F'},
  {g:'Cockpit', k:'stemL', label:'Stem length', u:'mm', step:10},
  {g:'Cockpit', k:'stemA', label:'Stem angle', u:'°'},
  {g:'Cockpit', k:'barW', label:'Handlebar width', u:'mm', step:20, f:'SF'},
  {g:'Cockpit', k:'barModel', label:'Handlebar model', t:'text', f:'F'},
  {g:'Cockpit', k:'spacers', label:'Headset spacer height', u:'mm', step:5, f:'SF'},
  {g:'Drivetrain', k:'crank', label:'Crank arm length', u:'mm', step:2.5, f:'FT'},
  {g:'Aero bars', k:'aeroModel', label:'Aero bar model', t:'text', f:'T'},
  {g:'Aero bars', k:'padStack', label:'Arm pad stack', u:'mm', step:5, hint:'BB to top of arm pad', f:'T'},
  {g:'Aero bars', k:'padReach', label:'Arm pad reach', u:'mm', step:5, hint:'BB to back of arm pad', f:'T'},
  {g:'Aero bars', k:'padDrop', label:'Saddle to arm pad drop', u:'mm', step:5, f:'T'},
  {g:'Aero bars', k:'noseToPad', label:'Saddle nose to arm pad', u:'mm', step:5, f:'T'},
  {g:'Aero bars', k:'noseToShifter', label:'Saddle nose to shifter', u:'mm', step:5, f:'T'},
  {g:'Aero bars', k:'padW', label:'Arm pad width', u:'mm', step:5, hint:'Centre to centre', f:'T'},
  {g:'Aero bars', k:'baseW', label:'Base bar width', u:'mm', step:10, f:'T'},
  {g:'Aero bars', k:'extLen', label:'Extension length', u:'mm', step:10, f:'T'},
  {g:'Aero bars', k:'extA', label:'Extension angle', u:'°', step:1, f:'T'},
  {g:'Coordinates', k:'hx', label:'Handlebar X coordinate', u:'mm', step:5, f:'F'}, {g:'Coordinates', k:'hy', label:'Handlebar Y coordinate', u:'mm', step:5, f:'F'},
  {g:'Coordinates', k:'sx', label:'Saddle X coordinate', u:'mm', step:5, f:'FT'}, {g:'Coordinates', k:'sy', label:'Saddle Y coordinate', u:'mm', step:5, f:'FT'},
  {g:'UCI position', k:'nose', label:'Saddle nose behind BB', u:'mm', step:5, f:'T'},
  {g:'UCI position', k:'extFront', label:'Extension tip ahead of BB', u:'mm', step:5, f:'T'},
];
const TTROWS = [];   // (a TT fit's rows are in BIKE now, marked T)
const ALLROWS = [...BIKE, ...TTROWS];

// injuries and special notes, an area at a time, as the interview form has them ("Other" is the notes field from before)
const INJ = [['inj_foot','Foot'],['inj_knee','Knee'],['inj_legs','Legs'],['inj_hip','Hip'],['inj_saddle','Saddle'],['inj_lowback','Lower back'],
  ['inj_back','Back'],['inj_shoulder','Shoulder'],['inj_neck','Neck'],['inj_arm','Arm'],['inj_hand','Hand'],['injuries','Other']];
const STRETCH = [
  {k:'ham', name:'Hamstring stretch', dose:'3 × 30 s each leg, daily'},
  {k:'hipflex', name:'Kneeling hip-flexor stretch', dose:'3 × 30 s each side, daily'},
  {k:'catcow', name:'Cat–cow & thoracic rotations', dose:'10 slow reps before each ride'},
  {k:'plank', name:'Plank progression', dose:'Build to 3 × 60 s, three times a week'},
  {k:'pec', name:'Doorway chest stretch', dose:'3 × 30 s, daily'},
  {k:'glute', name:'Glute bridges & clamshells', dose:'3 × 12, three times a week'},
  {k:'calf', name:'Calf & plantar fascia release', dose:'2 min each foot, after rides'},
  {k:'neck', name:'Chin tucks', dose:'10 reps, twice a day'},
];

const STEPS = [
  {id:'session', title:'Session', lede:'Choose the fit, then the rider and bike. Each fit type shows only the checks it includes.'},
  {id:'interview', title:'Rider interview', lede:'How they ride, what they want from the fit, and where it hurts.'},
  {id:'offbike', title:'Off-bike assessment', lede:'Measure and observe standing. Results drop straight into traffic lights for the report.'},
  {id:'onbike', title:'On-bike assessment', lede:'Record angles before and after. Each one is checked against the studio guide range as you type.'},
  {id:'bike', title:'Bike measurements', lede:'Before and after, in millimetres. Changes are worked out for you and lead the client report.'},
  {id:'photos', f:'FT', title:'Photos', lede:'Take photos on the iPad or add them from the library. Mark angles on them; they go into the PDF.'},
  {id:'report', title:'Report & send', lede:'Check the summary, add the plan and send the client their report.'},
];

function sectionsFor(step){
  switch(step){
  case 'session': return [
    {custom:'fits', title:'Fit type'},
    {title:'Session', fields:[SG('fitter','Fitter',FITTERS), T('date','Date',{type:'date'})]},
    {title:'Rider', fields:[T('first','First name'), T('last','Last name'), T('email','Email',{type:'email', ph:'For sending the report'}), T('phone','Phone',{type:'tel'}),
      T('address','Address',{span2:true}), T('city','Town / city'), T('postcode','Postcode')]},
    {title:'Bike', fields:[T('bike','Brand & model',{ph:'e.g. Trek Domane SL 6', span2:true}), T('frame','Frame size',{ph:'e.g. 56 cm'}),
      SG('bikeType','Bike type',['Road','Gravel','TT / Tri','Other']), T('pedals','Pedals & cleat float',{span2:true}), T('shoes','Shoe brand & size',{span2:true})]},
  ];
  case 'interview': return [
    ...(S.follow ? [{title:'Since the fit', fields:[SG('since','How the bike has felt',['Better','About the same','Worse'],{wide:true}),
      TA('sinceNote','What they’ve noticed',{ph:'Rides done, what feels better, any niggles back'})]}] : []),
    {title:'About the rider', fields:[SG('sex','Sex',['Male','Female'],{hint:'Sets the side of the saddle sizer'}), SG('style','Riding style',['Recreational','Serious recreational','Racer','Triathlete'],{wide:true}),
      N('age','Age','yrs'), N('height','Height','cm'), N('weight','Weight','kg'), T('build','Build',{ph:'e.g. slim, athletic, stocky'}), T('job','Occupation')]},
    {title:'Riding', fields:[N('rideTime','Average ride','hrs'), N('speed','Average speed','mph'), N('cadence','Cadence','rpm'), N('years','Years cycling','yrs'),
      N('daysS','Days a week (summer)','days'), N('daysW','Days a week (winter)','days'),
      CH('miles','How they get their yearly miles',['Club rides','Sportives','Solo','Commuting','Racing','Indoor / Zwift','Triathlon'],{wide:true})]},
    {title:'Goals for today', fields:[CH('goals','Goals',['Comfort','Longer rides','Performance','Fix pain or discomfort','New bike set-up','Aero speed','Event prep'],{wide:true}), TA('goalNote','In their words')]},
    {title:'On-bike problems', custom:'body', fields:[TA('problems','Describe the problems',{ph:'When it starts, which side, what helps'})]},
    {title:'Health & activity', fields:[TA('activities','Current physical activities (weekly or more)'), {t:'injgrid', k:'injgrid', label:'Injuries & special notes', hint:'broken bones, surgeries, chronic issues', wide:true},
      SG('treated','Treated by a medical professional or therapist?',['No','Yes'],{f:'FT', wide:true})]},
  ];
  case 'offbike': return [
    {title:'Feet', fields:[{t:'feetdraw', k:'feetdraw', label:'Foot angle standing', f:'FT', wide:true}, N('footAng','Foot angle','°',{lr:true, f:'FT', hint:'toe out +, toe in −'}), {t:'feet', k:'feet', label:'Feet, standing', f:'FT'},
      SG('footbed','Footbed',['Stock','Trimmed','Custom']), {t:'bio', k:'bio', label:'BioDynamic 3D arch profile', f:'FT'}, T('insole','Innersole size',{f:'FT'})]},
    {title:'Lower leg', f:'FT', note:'Laser line, standing', fields:[SG('lowerLeg','Lower leg analysis',['Supination','Neutral','Pronation'],{lr:true, wide:true})]},
    {title:'Knees', f:'FT', fields:[SG('knee','Alignment standing',['Bends in','Neutral','Bows out'],{lr:true, wide:true})]},
    {title:'Hips & pelvis', fields:[SG('pelvis','Pelvis height',['Left higher','Level','Right higher'],{f:'FT'}), SG('legLen','Leg length',['Equal','Left shorter','Right shorter'],{f:'FT'}),
      N('legLenMm','Difference','mm',{f:'FT', when:() => /shorter/.test(val('legLen') || '')}), SG('ischialW','Ischial (sit-bone) width',['Narrow','Medium','Wide'],{hint:'saddle sizer, set to the rider’s side'}),
      LT('backFlex','Sacrum angle','°','back',{f:'S', hint:'back flexibility'})]},
    {title:'Selle Italia idmatch', f:'FT', note:'Saddle selection', fields:[N('hipW','Hip width','cm'), N('thigh','Thigh diameter','cm',{lr:true}),
      LT('backFlex','Back flexibility (sacrum angle)','°','back'), T('idSaddle','Selle Italia saddle selection',{ph:'Model and size from idmatch', span2:true})]},
    {title:'Posture & shoulders', fields:[SG('shFwd','Shoulders drawn forward?',['Yes','No'],{f:'FT'}), SG('shLevel','Shoulders level?',['Left higher','Level','Right higher'],{f:'FT'}),
      N('shWidth','Shoulder width','cm'), SG('elbows','At 90°, elbows touching?',['Yes','No'],{f:'FT'})]},
    {title:'Body dimensions', fields:[{t:'inseam', k:'inseam', label:'Inseam (no shoes)'}]},
    {title:'Stability', f:'FT', note:'Plank test, up to 90 seconds', fields:[{t:'timer', k:'plank', label:'Plank hold', wide:true}]},
    {title:'Range of motion', f:'FT', fields:[LT('ham','Hamstring flexibility','°','ham',{lr:true}), LT('hipR','Hip restriction','°','hip',{lr:true})]},
  ];
  case 'onbike': return [
    // (the body measurements here are the off-bike assessment's own: the same fields, so they count once a fit)
    {title:'Starting position', custom:'start', ownFields:true,
      fields:[N('height','Height','cm'), N('inseam','Inseam','cm'), N('shWidth','Shoulder width','cm'), N('footAng','Foot angle','°',{lr:true, f:'FT'}),
        SG('ability','Ability',['Novice','Finisher','Competitor'],{f:'T'}), SG('distance','Race distance',['Ironman','Long','Sprint'],{f:'T'})]},
    {title:'Shoe set-up', fields:[CK('shoeSet',['Cleats at least 1 cm behind M1','Cleat rotation matches the off-bike foot assessment','Cleat rotation checked with the rider on the bike','Stance width adjusted for the rider'])]},
    {title:'Lower body', angles:[AN('legExt','Leg extension','°'), AN('hipTop','Hip angle, top of stroke','°'), AN('sacral','Sacral angle','°',{f:'FT'}), AN('kops','Knee over pedal spindle','cm'), AN('bmr','Body mass representation','cm')],
      fields:[SG('heel','Heel lift & pedal technique',['Even','Heel drops','Toes down']), SG('kneeTrack','Knee tracking',['Tracks in','Straight','Tracks out'],{lr:true, f:'FT'}),
        SG('latFoot','Lateral foot alignment',['Aligned','Wedge added','Spacer added'],{f:'FT'})]},
    {title:'Upper body', angles:[AN('torso','Torso angle','°'), AN('backAngle','Back angle','°'), AN('shoulder','Shoulder angle','°'), AN('elbow','Elbow angle','°')]},
    {title:'Aero position', f:'T', fields:[N('aeroHold','Holds the aero position for','min'), SG('head','Head position',['Low & tucked','Neutral','High']),
      SG('aeroFeel','How it feels',['Comfortable','Manageable','Struggling'])]},
    {title:'Other fit comments', fields:[TA('fitNotes','Notes',{ph:'Anything the numbers don’t show'})]},
  ];
  case 'bike': return [{custom:'bike'}];
  case 'photos': return [{custom:'photos'}];
  case 'report': return [{custom:'report'}];
  }
  return [];
}

/* ---------------- state ---------------- */
let S = null;
const newId = () => Date.now().toString(36) + uid();
// (who's signed in: api/me, functions/_fitstudio.js; a new fit's fitter, where they're one of FITTERS)
let ME = '';
const blank = () => ({id:newId(), created:Date.now(), fit:'full', step:0, v:{date:new Date().toISOString().slice(0,10), fitter:FITTERS.find(f => f.toLowerCase() === ME.toLowerCase()) || ''}, pain:{}, photos:[], products:[], stretches:null});

/* storage: every fit kept in this browser (IndexedDB, one record a fit, photos and all); the one that's open remembered
   (localStorage). Where the browser won't keep anything (some private windows), the fit lives only as long as the page. */
const DBN = 'pr-fitting', CUR = 'pr-fitting-open';
let dbp = null;
function db(){
  if (!dbp) dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore('fits', {keyPath:'id'}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch(e){ rej(e); }
  });
  return dbp;
}
async function tx(mode, fn){
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction('fits', mode), q = fn(t.objectStore('fits')); t.oncomplete = () => res(q ? q.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
}
const dbGet = id => tx('readonly', st => st.get(id)), dbAll = () => tx('readonly', st => st.getAll());
const dbPut = rec => tx('readwrite', st => st.put(rec)), dbDel = id => tx('readwrite', st => st.delete(id));
const lsGet = k => { try { return localStorage.getItem(k); } catch(_){ return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(_){} };
// (an open fit, else a new one: the first one a Standard Fit, as New fit makes. The example rider the app first came
// with, Jordan Hale, saved as 'sample': deleted from every device that has him)
async function load(){
  try { await dbDel('sample'); } catch(_){}
  const id = lsGet(CUR);
  if (id && id !== 'sample'){ try { const r = await dbGet(id); if (r && r.v) return Object.assign(blank(), r); } catch(_){} }
  const s = blank(); s.fit = 'std'; return s;
}
const record = () => ({...S, updated:Date.now(), photos:S.photos.map(p => { const {_comp, ...rest} = p; return rest; })});
let saveT = null;
async function writeNow(){
  clearTimeout(saveT); saveT = null;
  try {
    await dbPut(record()); lsSet(CUR, S.id);
    const t = new Date();
    $('#saved').textContent = `Saved ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  } catch(e){
    $('#saved').textContent = e && e.name === 'QuotaExceededError' ? 'Not saved: this device is out of space' : 'Not saved: this browser is blocking storage';
  }
}
function save(){ clearTimeout(saveT); saveT = setTimeout(writeNow, 350); }
async function openFit(rec){
  if (saveT) await writeNow();
  S = Object.assign(blank(), rec);
  lsSet(CUR, S.id); $('#fits').hidden = true; renderMain(); window.scrollTo(0, 0);
  await markPhotos(); renderMain();
}
async function newFit(){
  if (saveT) await writeNow();
  S = blank(); S.fit = 'std'; await writeNow();
  $('#fits').hidden = true; renderMain(); window.scrollTo(0, 0);
}

/* a follow-up: a new fit for the same rider and bike, starting where the last one finished. Everything the rider
   told us and every body measurement comes across to update; the bike's and the angles' After values become this
   visit's Before; the After photos become its Before photos; the plan carries on. Its own date, notes and summary. */
const FRESH = new Set(['date', 'summary', 'fitNotes', 'since', 'sinceNote']);
async function startFollowUp(prev){
  if (saveT) await writeNow();
  const S2 = blank(), v = {};
  for (const [k, x] of Object.entries(prev.v || {})){
    if (FRESH.has(k) || k.endsWith('_pre') || k === 'fitter') continue;
    if (k.endsWith('_post')){ v[k.slice(0, -5) + '_pre'] = x; continue; }
    v[k] = x;
  }
  for (const [k, x] of Object.entries(prev.v || {})) if (k.endsWith('_pre') && !filled(v[k])) v[k] = x;   // (where nothing was changed)
  S2.fit = prev.fit; S2.v = Object.assign(S2.v, v); S2.pain = {...(prev.pain || {})}; S2.step = 1;
  S2.follow = {of:prev.id, date:prev.v.date || '', fitter:prev.v.fitter || ''};
  S2.photos = (prev.photos || []).filter(p => p.src && /^After · (side|front)$/.test(p.tag))
    .map(p => ({...p, id:uid(), tag:p.tag.replace('After', 'Before'), cap:p.cap ? `At the last fit: ${p.cap}` : 'At the last fit', _comp:undefined}));
  S = S2; await writeNow();
  $('#fits').hidden = true; renderMain(); window.scrollTo(0, 0); await markPhotos();
}
const dayTxt = (d, o = {day:'numeric', month:'short'}) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', o) : '';
// a fit's follow-up, by the fits list: done (the follow-up's date), else when it's due (Full and TT fits, eight weeks on)
function followState(f, all){
  const done = all.filter(x => x.follow && x.follow.of === f.id).sort((a, b) => (b.v.date || '').localeCompare(a.v.date || ''))[0];
  if (done) return {cls:'g', txt:`Followed up ${dayTxt(done.v.date)}`};
  if (f.follow || f.fit === 'std' || !f.v.date) return null;
  const due = new Date(f.v.date + 'T12:00:00'); due.setDate(due.getDate() + 56);
  const over = due < new Date();
  return {cls:over ? 'r' : 'y', txt:`${over ? 'Follow-up overdue since' : 'Follow-up due'} ${due.toLocaleDateString('en-GB', {day:'numeric', month:'short'})}`};
}

/* the fits on this device */
let FITLIST = [];
async function openFits(){
  if (saveT) await writeNow();
  try { FITLIST = (await dbAll()).sort((a, b) => (b.updated || 0) - (a.updated || 0)); } catch(_){ FITLIST = []; }
  $('#fits-q').value = ''; renderFits(); $('#fits').hidden = false;
}
function renderFits(){
  const q = $('#fits-q').value.trim().toLowerCase();
  const rows = FITLIST.filter(f => !q || [f.v.first, f.v.last, f.v.bike, f.v.email].join(' ').toLowerCase().includes(q));
  $('#fitlist').innerHTML = rows.length ? rows.map(f => {
    const name = [f.v.first, f.v.last].filter(Boolean).join(' ') || 'Rider not named yet';
    const when = f.v.date ? new Date(f.v.date + 'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) : '';
    const open = S && f.id === S.id;
    const st = followState(f, FITLIST);
    return `<div class="fit-row${open ? ' open' : ''}"><div class="fr-main"><b>${esc(name)}${f.follow ? ' <span class="pill n">Follow-up</span>' : ''}</b>
      <span>${esc([FITS[f.fit] ? FITS[f.fit].name : '', f.v.bike, when].filter(Boolean).join(' · '))}</span>
      ${st ? `<span class="fr-state"><span class="pill ${st.cls}">${esc(st.txt)}</span></span>` : ''}</div>
      <button type="button" class="btn sm" data-act="fit-follow" data-id="${esc(f.id)}">Start follow-up</button>
      ${open ? '<span class="pill g">Open</span>' : `<button type="button" class="btn sm dark" data-act="fit-open" data-id="${esc(f.id)}">Open</button>`}
      <button type="button" class="btn sm ghost" data-act="fit-del" data-id="${esc(f.id)}">Delete</button></div>`;
  }).join('') : `<p class="hint">No fits match “${esc(q)}”.</p>`;
}

const fitCode = () => FITS[S.fit].code;
const applies = o => (o.f || 'SFT').includes(fitCode());
const val = k => S.v[k];
const num = k => { const x = S.v[k]; return isNum(x) ? x : null; };
const filled = x => Array.isArray(x) ? x.some(Boolean) : (x !== undefined && x !== null && x !== '');
const range = k => TARGETS[k] ? TARGETS[k][S.fit === 'tt' ? 'tt' : 'road'] : null;
const fmt = (x, d = 1) => x == null ? '–' : (Math.round(x * 10 ** d) / 10 ** d).toString().replace('-', '−');
const signed = (x, u) => (x > 0 ? '+' : x < 0 ? '−' : '±') + fmt(Math.abs(x)) + (u === '°' ? '°' : ' ' + u);
const lightOf = (k, cl) => { const n = num(k); if (n != null) return CL[cl].fn(n); return S.v[k + '_c'] || null; };
const fullName = () => [val('first'), val('last')].filter(Boolean).join(' ');

/* ---------------- field rendering ---------------- */
function inputHTML(k, f){
  const v = S.v[k];
  if (f.t === 'num' || f.t === 'light') return `<div class="num"><input type="text" inputmode="decimal" id="i-${k}" data-k="${k}" data-num value="${v ?? ''}" autocomplete="off" aria-label="${esc(f.label)}"><span class="u">${esc(f.unit)}</span></div>`;
  if (f.t === 'seg' || f.t === 'chips'){
    const multi = f.t === 'chips';
    return `<div class="seg${multi ? ' chips' : ''}" role="group" aria-label="${esc(f.label)}">${f.opts.map(o => {
      const on = multi ? (Array.isArray(v) && v.includes(o)) : v === o;
      return `<button type="button" id="b-${k}-${esc(o).replace(/\W+/g,'')}" data-seg="${k}" data-val="${esc(o)}"${multi ? ' data-multi' : ''} aria-pressed="${on}">${esc(o)}</button>`;
    }).join('')}</div>`;
  }
  return '';
}
function tlHTML(k, cl){
  const c = lightOf(k, cl);
  return `<div class="tl" data-x="tl" data-k="${k}" data-cl="${cl}">${['r','y','g'].map(x => `<button type="button" data-tlset="${k}" data-c="${x}" aria-pressed="${c === x}"><b>${CNAME[x]}</b><span>${CL[cl].txt[x]}</span></button>`).join('')}</div>`;
}
// (a row of option buttons: about how wide, so it never wraps in a cell too narrow for it; a cell is at least 210px)
function segRoom(f){
  if (!f.opts) return '';
  const w = f.opts.reduce((a, o) => a + o.length * 8.6 + 36, 0) + 8 * (f.opts.length - 1);
  return w > 440 ? ' wide' : w > 214 ? ' span2' : '';
}
// (a field shown only when another answer calls for it: f.when, checked again as answers change, refresh())
const WHEN = {};
function fieldHTML(f){
  if (!applies(f)) return '';
  if (f.when){ WHEN[f.k] = f.when; return `<div class="when" data-when="${f.k}"${f.when() ? '' : ' hidden'}>${fieldInner(f)}</div>`; }
  return fieldInner(f);
}
function fieldInner(f){
  const wide = f.wide ? ' wide' : f.span2 ? ' span2' : '';
  const lab = `<span class="lab">${esc(f.label)}${f.hint ? ` <small>· ${esc(f.hint)}</small>` : ''}</span>`;
  switch (f.t){
  case 'text': {
    const v = S.v[f.k] ?? '';
    return `<div class="fld${wide}"><label class="lab" for="i-${f.k}">${esc(f.label)}</label><input type="${f.type || 'text'}" id="i-${f.k}" data-k="${f.k}" value="${esc(v)}"${f.ph ? ` placeholder="${esc(f.ph)}"` : ''} autocomplete="off"></div>`;
  }
  case 'area':
    return `<div class="fld wide"><label class="lab" for="i-${f.k}">${esc(f.label)}</label><textarea id="i-${f.k}" data-k="${f.k}"${f.ph ? ` placeholder="${esc(f.ph)}"` : ''}>${esc(S.v[f.k] ?? '')}</textarea></div>`;
  case 'num': case 'seg': case 'chips':
    if (f.lr && f.t === 'num') return `<div class="fld span2">${lab}<div class="lr inline"><span class="side">L</span>${inputHTML(f.k + '_L', f)}<span class="side">R</span>${inputHTML(f.k + '_R', f)}</div></div>`;
    if (f.lr) return `<div class="fld${f.t === 'seg' ? ' wide' : wide}">${lab}<div class="lr"><span class="side">L</span>${inputHTML(f.k + '_L', f)}<span class="side">R</span>${inputHTML(f.k + '_R', f)}</div></div>`;
    // (a row of buttons that wouldn't fit beside another field takes the whole row, so it never wraps in a narrow cell)
    return `<div class="fld${wide || segRoom(f)}">${lab}${inputHTML(f.k, f)}</div>`;
  case 'light': {
    const one = k => `<div class="light">${inputHTML(k, f)}${tlHTML(k, f.cl)}</div>`;
    if (f.lr) return `<div class="fld wide">${lab}<div class="lr"><span class="side">L</span>${one(f.k + '_L')}<span class="side">R</span>${one(f.k + '_R')}</div></div>`;
    return `<div class="fld wide">${lab}${one(f.k)}</div>`;
  }
  case 'feet': {
    const cols = [['L', 'u', 'Left', 'unweighted'], ['L', 'w', 'Left', 'weighted'], ['R', 'u', 'Right', 'unweighted'], ['R', 'w', 'Right', 'weighted']];
    const key = (b, side, w) => `${b}_${side}${w === 'u' ? '_u' : ''}`;
    const numCell = (b, unit) => cols.map(([sd, w]) => `<div class="num"><input type="text" inputmode="decimal" id="i-${key(b, sd, w)}" data-k="${key(b, sd, w)}" data-num value="${S.v[key(b, sd, w)] ?? ''}" aria-label="${b} ${sd} ${w}"><span class="u">${unit}</span></div>`);
    const archCell = cols.map(([sd, w]) => { const k2 = key('arch', sd, w);
      return `<div class="seg sm" role="group" aria-label="Arch ${sd} ${w === 'u' ? 'unweighted' : 'weighted'}">${[['Low','Low'],['Medium','Med'],['High','High']].map(([o, l]) => `<button type="button" id="b-${k2}-${o}" data-seg="${k2}" data-val="${o}" aria-pressed="${S.v[k2] === o}">${l}</button>`).join('')}</div>`; });
    const sizeCell = cols.map(([sd, w]) => { const k2 = key('footSize', sd, w); return `<input type="text" id="i-${k2}" data-k="${k2}" value="${esc(S.v[k2] ?? '')}" placeholder="e.g. 43" aria-label="Size ${sd} ${w}">`; });
    // (a row: its name, the left foot's two cells, a line, the right foot's two)
    const row = (name, c) => `<span class="fr">${name}</span>${c[0]}${c[1]}<i class="fsep"></i>${c[2]}${c[3]}`;
    return `<div class="fld wide"><span class="lab">${esc(f.label)}</span><div class="ftab-wrap"><div class="ftab">
      <span></span><span class="fside">Left foot</span><i class="fsep"></i><span class="fside">Right foot</span>
      <span></span><span class="fh">Unweighted</span><span class="fh">Weighted</span><i class="fsep"></i><span class="fh">Unweighted</span><span class="fh">Weighted</span>
      ${row('Size', sizeCell)}${row('Length', numCell('footLen', 'mm'))}${row('Width', numCell('footWid', 'mm'))}${row('Arch height', archCell)}
    </div></div></div>`;
  }
  case 'feetdraw': return feetHTML();
  case 'injgrid':
    return `<div class="fld wide">${lab}<div class="inj">${INJ.map(([k, l]) => `<div class="fld"><label class="lab" for="i-${k}">${l}</label><input type="text" id="i-${k}" data-k="${k}" value="${esc(S.v[k] ?? '')}" autocomplete="off"></div>`).join('')}</div></div>`;
  case 'bio': {
    const c = S.v.bio;
    const t = {r:'Low arch', y:'Medium arch', b:'High arch'};
    return `<div class="fld span2">${lab}<div class="tl">${['r','y','b'].map(x => `<button type="button" data-bio="${x}" data-c="${x}" aria-pressed="${c === x}"><b>${CNAME[x]}</b><span>${t[x]}</span></button>`).join('')}</div></div>`;
  }
  case 'inseam':
    return `<div class="fld wide"><span class="lab">${esc(f.label)}</span><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${inputHTML('inseam', {t:'num', unit:'cm', label:f.label})}<div class="calc" data-x="inseam"></div></div></div>`;
  case 'timer':
    return `<div class="fld wide"><div class="timer"><div class="clock" id="clock">${fmtClock((S.v.plank || 0) * 1000)}</div>
      <button type="button" class="btn dark" id="tm-go" data-act="timer">Start plank</button>
      <div class="num" style="width:150px"><input type="text" inputmode="decimal" id="i-plank" data-k="plank" data-num value="${S.v.plank ?? ''}" aria-label="Plank seconds"><span class="u">sec</span></div></div>
      ${tlHTML('plank', 'plank')}</div>`;
  case 'check': {
    const a = S.v[f.k] || [];
    return `<div class="checks wide">${f.items.map((it, i) => `<button type="button" class="chk" id="c-${f.k}-${i}" data-chk="${f.k}" data-i="${i}" aria-pressed="${!!a[i]}"><span class="box">${ICON_TICK}</span><span>${esc(it)}</span></button>`).join('')}</div>`;
  }
  }
  return '';
}
function angleHTML(f){
  if (!applies(f)) return '';
  const r = range(f.k);
  return `<div class="ang"><div><div class="nm">${esc(f.label)}</div><div class="gd">${r ? guideTxt(r, f.unit) : 'Recorded only'}</div></div>
    <div class="pp">
      <div class="fld"><label class="lab" for="i-${f.k}_pre">Before</label><div class="num"><input type="text" inputmode="decimal" id="i-${f.k}_pre" data-k="${f.k}_pre" data-num value="${S.v[f.k + '_pre'] ?? ''}"><span class="u">${f.unit}</span></div></div>
      <div class="fld"><label class="lab" for="i-${f.k}_post">After</label><div class="num"><input type="text" inputmode="decimal" id="i-${f.k}_post" data-k="${f.k}_post" data-num value="${S.v[f.k + '_post'] ?? ''}"><span class="u">${f.unit}</span></div></div>
    </div>
    <div class="gauge-wrap" data-x="gauge" data-k="${f.k}" data-u="${f.unit}"></div></div>`;
}
// "Guide 138–148°"; a range across nothing "Guide −1 to +1 cm"
function guideTxt(r, unit){
  const u = unit === '°' ? '°' : ' ' + unit;
  return r[0] < 0 ? `Guide ${fmt(r[0])} to ${r[1] > 0 ? '+' : ''}${fmt(r[1])}${u}` : `Guide ${fmt(r[0])}–${fmt(r[1])}${u}`;
}
function gaugeHTML(k, unit){
  const pre = num(k + '_pre'), post = num(k + '_post'), r = range(k);
  const vals = [pre, post].filter(x => x != null);
  if (!vals.length && !r) return '<div class="gread"><span class="hint">Not measured</span></div>';
  const lo0 = Math.min(...vals, ...(r || [])), hi0 = Math.max(...vals, ...(r || []));
  const pad = Math.max((hi0 - lo0) * 0.25, r ? (r[1] - r[0]) * 0.4 : 1, 1);
  const lo = lo0 - pad, hi = hi0 + pad, P = x => ((x - lo) / (hi - lo) * 100).toFixed(2);
  const st = x => !r || x == null ? null : x < r[0] ? 'below' : x > r[1] ? 'above' : 'in';
  const u = unit === '°' ? '°' : ' ' + unit;
  const s = st(post ?? pre);
  const chip = s ? `<span class="pill ${s === 'in' ? 'g' : 'r'}">${s === 'in' ? 'In range' : s === 'above' ? 'Above range' : 'Below range'}</span>` : '';
  const read = pre != null && post != null ? `${fmt(pre)}${u} → <b>${fmt(post)}${u}</b>` : vals.length ? `${fmt(vals[0])}${u}` : '<span class="hint">Not measured</span>';
  let g = `<div class="gauge"><div class="g-track"></div>`;
  if (r) g += `<div class="g-band" style="left:${P(r[0])}%;width:${(P(r[1]) - P(r[0])).toFixed(2)}%"></div><div class="g-lab" style="left:${P(r[0])}%">${fmt(r[0])}</div><div class="g-lab" style="left:${P(r[1])}%">${fmt(r[1])}</div>`;
  if (pre != null && post != null) g += `<div class="g-move" style="left:${P(Math.min(pre, post))}%;width:${Math.abs(P(post) - P(pre)).toFixed(2)}%"></div>`;
  if (pre != null) g += `<div class="g-pre" style="left:${P(pre)}%" title="Before"></div>`;
  if (post != null) g += `<div class="g-post${st(post) && st(post) !== 'in' ? ' out' : ''}" style="left:${P(post)}%" title="After"></div>`;
  g += '</div>';
  return `<div class="gread"><span class="num-t">${read}</span>${chip}</div>${g}`;
}

/* ---------------- custom blocks ---------------- */
function fitsHTML(){
  return `<div class="sec" id="sec-0"><div class="sec-h"><h2>Fit type</h2><span class="sec-note">Changes which checks appear in every step</span></div><div class="fits">${Object.entries(FITS).map(([id, f]) => `
    <button type="button" class="fitc" id="fit-${id}" data-fit="${id}" aria-pressed="${S.fit === id}"><span class="tick">${ICON_TICK}</span>
      <span class="fname">${f.name}</span><span class="fmeta"><b>${f.price}</b> ${f.time}</span><span class="fwho">${f.who}</span>
      <span class="fl">${f.incl.map(i => `<span class="fi">${i}</span>`).join('')}</span></button>`).join('')}</div></div>`;
}
function bodyHTML(){
  const s = k => S.pain[k] || 0;
  const R = (k, shape) => shape.replace('/>', ` class="bm-r" data-bm="${k}" data-s="${s(k)}"><title>${PAIN[k]}</title></${shape.match(/^<(\w+)/)[1]}>`);
  const svg = `<svg viewBox="0 0 200 372" role="group" aria-label="Body map, viewed from behind">
    <circle class="bm-base" cx="100" cy="26" r="19"/>
    ${R('back', '<rect x="71" y="58" width="58" height="56" rx="12"/>')}
    ${R('lowback', '<rect x="73" y="116" width="54" height="34" rx="10"/>')}
    ${R('neck', '<rect x="90" y="44" width="20" height="15" rx="5"/>')}
    ${R('arm_L', '<rect x="37" y="80" width="19" height="92" rx="9.5"/>')}${R('arm_R', '<rect x="144" y="80" width="19" height="92" rx="9.5"/>')}
    ${R('shoulder_L', '<circle cx="62" cy="71" r="14"/>')}${R('shoulder_R', '<circle cx="138" cy="71" r="14"/>')}
    ${R('hand_L', '<circle cx="46" cy="185" r="11"/>')}${R('hand_R', '<circle cx="154" cy="185" r="11"/>')}
    ${R('leg_L', '<rect x="70" y="176" width="27" height="76" rx="13"/>')}${R('leg_R', '<rect x="103" y="176" width="27" height="76" rx="13"/>')}
    ${R('hip_L', '<circle cx="81" cy="161" r="15"/>')}${R('hip_R', '<circle cx="119" cy="161" r="15"/>')}
    ${R('saddle', '<ellipse cx="100" cy="180" rx="12" ry="9"/>')}
    <rect class="bm-base" x="74" y="272" width="19" height="58" rx="9.5"/><rect class="bm-base" x="107" y="272" width="19" height="58" rx="9.5"/>
    ${R('knee_L', '<circle cx="83" cy="262" r="13"/>')}${R('knee_R', '<circle cx="117" cy="262" r="13"/>')}
    ${R('foot_L', '<ellipse cx="81" cy="346" rx="16" ry="10"/>')}${R('foot_R', '<ellipse cx="119" cy="346" rx="16" ry="10"/>')}
    <text class="bm-txt" x="12" y="236">L</text><text class="bm-txt" x="180" y="236">R</text></svg>`;
  return `<div class="bodymap"><div class="bm">${svg}</div><div>
    <div class="bm-legend"><span>Tap an area: once for <span class="pill y">Niggle</span>, twice for <span class="pill r">Painful</span>, again to clear. Viewed from behind.</span></div>
    <div class="bm-list" data-x="painlist"></div></div></div>`;
}
function painListHTML(){
  const e = Object.entries(S.pain).filter(([, v]) => v);
  if (!e.length) return '<span class="hint">No areas flagged yet.</span>';
  return e.sort((a, b) => b[1] - a[1]).map(([k, v]) => `<button type="button" data-bm="${k}" aria-label="${PAIN[k]}: tap to change"><span class="pill ${v === 2 ? 'r' : 'y'}">${PAIN[k]} · ${v === 2 ? 'Painful' : 'Niggle'}</span></button>`).join('');
}
function stepper(k, row){
  const v = S.v[k];
  if (row.t === 'text') return `<input type="text" id="i-${k}" data-k="${k}" value="${esc(v ?? '')}" aria-label="${esc(row.label)}">`;
  return `<div class="step"><button type="button" data-stepk="${k}" data-dir="-1" data-by="${row.step || 1}" aria-label="Decrease">−</button>
    <div class="num"><input type="text" inputmode="decimal" id="i-${k}" data-k="${k}" data-num value="${v ?? ''}" aria-label="${esc(row.label)}"><span class="u">${row.u}</span></div>
    <button type="button" data-stepk="${k}" data-dir="1" data-by="${row.step || 1}" aria-label="Increase">+</button></div>`;
}
function rowsHTML(rows){
  let g = null;
  return `<div class="btable"><div class="brow hd"><span>Measurement</span><span>Pre-fit</span><span>Post-fit</span><span style="text-align:right">Change</span></div>
    ${rows.filter(applies).map(r => { const head = r.g && r.g !== g ? `<div class="bgrp">${esc(r.g)}</div>` : ''; g = r.g;
      return head + `<div class="brow"><div class="nm">${esc(r.label)}${r.hint ? `<small>${esc(r.hint)}</small>` : ''}</div>
      <div class="cell" data-l="Pre-fit">${stepper(r.k + '_pre', r)}</div><div class="cell" data-l="Post-fit">${stepper(r.k + '_post', r)}</div>
      <div class="delta" data-x="delta" data-k="${r.k}"></div></div>`; }).join('')}</div>`;
}
function deltaOf(r){
  const a = S.v[r.k + '_pre'], b = S.v[r.k + '_post'];
  if (r.t === 'text') return filled(a) && filled(b) && a !== b ? {txt:'Changed', ch:true} : {txt:filled(a) && filled(b) ? 'Same' : '–', ch:false};
  if (!isNum(a) || !isNum(b)) return {txt:'–', ch:false};
  const d = Math.round((b - a) * 10) / 10;
  return {txt:d === 0 ? 'Same' : signed(d, r.u), ch:d !== 0, d};
}
function bikeHTML(){
  let h = `<div class="sec"><div class="sec-h"><h2>Bike set-up</h2><div class="right"><span class="sec-note">Tap − / + to nudge, or type a value</span><button type="button" class="btn sm" data-act="copy-same">Copy unchanged to Post-fit</button></div></div><div id="copy-msg"></div>${rowsHTML(BIKE)}</div>
  <div class="sec"><div class="sec-h"><h2>Cleats</h2></div><div class="grid">
    ${fieldHTML(T('cleatL','Left cleat',{ph:'e.g. 1.2 cm behind M1, neutral', span2:true}))}${fieldHTML(T('cleatR','Right cleat',{span2:true}))}</div></div>`;
  if (S.fit === 'tt') h += `<div class="sec"><div class="sec-h"><h2>UCI position check</h2><span class="tag-fit">TT &amp; Tri</span></div><div class="uci" data-x="uci"></div></div>`;
  return h;
}
function uciHTML(){
  const ht = num('height'), nose = num('nose_post') ?? num('nose_pre'), ext = num('extFront_post') ?? num('extFront_pre');
  const lim = ht == null ? 750 : ht >= 190 ? 850 : ht >= 180 ? 800 : 750;
  const card = (t, ok, body) => `<div class="u-c"><b>${t}</b>${ok == null ? '<span class="pill n">Not measured</span>' : `<span class="pill ${ok ? 'g' : 'r'}">${ok ? 'Within UCI limit' : 'Outside UCI limit'}</span>`}<span class="hint">${body}</span></div>`;
  return card('Saddle setback', nose == null ? null : nose >= 50, `Nose at least 50 mm behind the BB${nose != null ? ` · now ${fmt(nose)} mm` : ''}`) +
         card('Extension reach', ext == null ? null : ext <= lim, `Up to ${lim} mm ${ht ? `for a ${ht} cm rider` : 'by default'}${ext != null ? ` · now ${fmt(ext)} mm` : ''}. Check the current UCI rules before a race.`) +
         `<div class="u-c"><b>Triathlon</b><span class="hint">Non-drafting triathlon does not use these limits. Record the event the rider is fitting for in the notes.</span></div>`;
}

/* ---------------- photos ---------------- */
const TAGS = ['Before · side','After · side','Before · front','After · front','Aero · front','Cleats & feet','Saddle pressure map','Posture','Other'];
const SLOTS = {std:['Before · side','After · side'], full:['Before · side','After · side','Before · front','After · front','Cleats & feet'],
  tt:['Before · side','After · side','Before · front','After · front','Aero · front','Cleats & feet']};
const SLOT_HINT = {'Before · side':'Drive side, cranks level, before any changes','After · side':'Same spot and height as the before photo','Before · front':'Square on, from in front of the bike','After · front':'Same spot as the before photo','Aero · front':'Rider on the extensions, square on','Cleats & feet':'Sole view of both shoes'};
const ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const canCompare = () => S.fit !== 'std' && ['Before · side','After · side'].every(t => S.photos.some(p => p.src && p.tag === t));
function photoCard(p){
  const done = p.marks.filter(m => m.p.length === 3);
  return `<div class="ph"><button type="button" class="img" data-ph="${p.id}" data-act="measure" aria-label="Measure angles on this photo">
      ${p.src ? `<img src="${p._comp || p.src}" alt="${esc(p.tag)}">` : ''}<span class="badge">${done.length ? done.map(m => fmt(angleOf(p, m), 0) + '°').join(' · ') : 'Tap to measure'}</span></button>
    <div class="body">
      <select id="pt-${p.id}" data-pk="${p.id}" data-f="tag" aria-label="Photo type">${TAGS.map(t => `<option${t === p.tag ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <input type="text" id="pc-${p.id}" data-pk="${p.id}" data-f="cap" value="${esc(p.cap)}" placeholder="Caption for the client" aria-label="Caption">
      <div class="acts"><button type="button" class="btn sm" data-ph="${p.id}" data-act="measure">Measure angle</button>
        <button type="button" class="btn sm inc" data-ph="${p.id}" data-act="inc" aria-pressed="${p.inc}">${p.inc ? '✓ In report' : 'Not in report'}</button>
        <button type="button" class="btn sm ghost" data-ph="${p.id}" data-act="del">Remove</button></div>
    </div></div>`;
}
function photosHTML(){
  const used = new Set();
  const slots = SLOTS[S.fit].map((tag, i) => {
    const p = S.photos.find(x => x.src && x.tag === tag && !used.has(x.id));
    if (p){ used.add(p.id); return photoCard(p); }
    return `<label class="slot" for="slot-${i}">${ICON_CAM}<b>${esc(tag)}</b><span>${esc(SLOT_HINT[tag] || '')}</span><span class="go">Tap to take or choose</span>
      <input type="file" id="slot-${i}" accept="image/*" data-slot="${esc(tag)}"></label>`;
  }).join('');
  const got = SLOTS[S.fit].filter(t => S.photos.some(p => p.src && p.tag === t)).length, all = SLOTS[S.fit].length;
  const extra = S.photos.filter(p => p.src && !used.has(p.id));
  return `<div class="sec"><div class="sec-h"><h2>Shot list</h2><div class="right">${canCompare() ? '<button type="button" class="btn sm dark" data-act="compare">Compare before &amp; after</button>' : ''}<span class="sec-count${got === all ? ' ok' : ''}">${got === all ? '✓ ' : ''}${got} of ${all}${S.fit === 'std' ? ' · optional' : ''}</span></div></div>
    <div class="slots">${slots}</div></div>
  <div class="sec"><div class="sec-h"><h2>More photos</h2><span class="sec-note">Pressure maps, posture, anything else worth showing</span></div>
    <label class="drop" id="drop">${ICON_CAM}<b>Add more photos</b><span class="hint">Take a photo or choose several from the library. You can also drag photos here.</span>
      <input type="file" id="file" accept="image/*" multiple></label>
    <div id="ph-msg"></div>
    ${extra.length ? `<div class="photos">${extra.map(photoCard).join('')}</div>` : ''}</div>`;
}
function downscale(file, max){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res({src:c.toDataURL('image/jpeg', 0.85), w:c.width, h:c.height});
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(`${file.name} could not be opened. Use a JPEG or PNG photo.`)); };
    img.src = url;
  });
}
async function addFiles(files, slotTag){
  const errs = []; let first = true;
  for (const f of files){
    if (!f.type.startsWith('image/')){ errs.push(`${f.name} is not an image.`); continue; }
    try {
      const r = await downscale(f, 1600);
      const used = new Set(S.photos.filter(p => p.src).map(p => p.tag));
      const tag = (first && slotTag) || SLOTS[S.fit].find(t => !used.has(t)) || 'Other'; first = false;
      S.photos.push({id:uid(), ...r, tag, cap:'', marks:[], inc:true});
    } catch(e){ errs.push(e.message); }
  }
  save(); renderMain();
  if (errs.length) { const m = $('#ph-msg'); if (m) m.innerHTML = `<div class="msg err" style="margin-top:12px">${errs.map(esc).join('<br>')}</div>`; }
}
function angleOf(p, m){
  const [a, b, c] = m.p.map(([x, y]) => [x * p.w, y * p.h]);
  const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
  const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}
function drawMarks(g, p, W, H, unit){
  p.marks.forEach(m => {
    const pts = m.p.map(([x, y]) => [x * W, y * H]);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const line = (a, b) => { g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = unit * 2.2; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      g.strokeStyle = '#ffd400'; g.lineWidth = unit * 1.1; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); };
    if (pts.length >= 2) line(pts[1], pts[0]);
    if (pts.length === 3){
      line(pts[1], pts[2]);
      const [a, b, c] = pts, a1 = Math.atan2(a[1] - b[1], a[0] - b[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const r = unit * 16;
      g.strokeStyle = '#ffd400'; g.lineWidth = unit * 0.9; g.beginPath(); g.arc(b[0], b[1], r, a1, a1 + d, d < 0); g.stroke();
      const mid = a1 + d / 2, lx = b[0] + Math.cos(mid) * r * 2.1, ly = b[1] + Math.sin(mid) * r * 2.1;
      const txt = Math.round(angleOf(p, m)) + '°';
      g.font = `700 ${unit * 9}px 'Barlow Condensed', 'Barlow', sans-serif`;
      const tw = g.measureText(txt).width, ph = unit * 12, pw = tw + unit * 8;
      g.fillStyle = 'rgba(15,17,20,.86)'; roundRect(g, lx - pw / 2, ly - ph / 2, pw, ph, ph / 2); g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, lx, ly + unit * 0.5);
    }
    pts.forEach((q, i) => { g.beginPath(); g.arc(q[0], q[1], unit * (i === 1 ? 4.2 : 3.4), 0, 7); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = unit * 1.3; g.strokeStyle = '#14161a'; g.stroke(); });
  });
}
function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function composite(p){
  if (!p.src) return Promise.resolve(null);
  if (!p.marks.some(m => m.p.length)) { p._comp = null; return Promise.resolve(p.src); }
  return new Promise(res => { const img = new Image(); img.onload = () => {
    const c = document.createElement('canvas'); c.width = p.w; c.height = p.h; const g = c.getContext('2d');
    g.drawImage(img, 0, 0, p.w, p.h); drawMarks(g, p, p.w, p.h, Math.max(p.w, p.h) / 400);
    p._comp = c.toDataURL('image/jpeg', 0.88); res(p._comp); }; img.src = p.src; });
}

/* measuring overlay */
let MZ = null;
function openMeasure(id){
  const p = S.photos.find(x => x.id === id); if (!p || !p.src) return;
  MZ = {p, img:new Image(), drag:null, cur:null};
  MZ.img.onload = () => { $('#mz').hidden = false; layoutMZ(); };
  MZ.img.src = p.src;
}
function layoutMZ(){
  if (!MZ) return;
  const st = $('#mz-stage'), c = $('#mz-c'), p = MZ.p;
  const s = Math.min((st.clientWidth - 24) / p.w, (st.clientHeight - 24) / p.h);
  const w = Math.max(50, p.w * s), h = Math.max(50, p.h * s), dpr = window.devicePixelRatio || 1;
  c.style.width = w + 'px'; c.style.height = h + 'px'; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  MZ.cw = w; MZ.ch = h; MZ.dpr = dpr; drawMZ();
}
function drawMZ(){
  const c = $('#mz-c'), g = c.getContext('2d'), p = MZ.p;
  g.setTransform(MZ.dpr, 0, 0, MZ.dpr, 0, 0); g.clearRect(0, 0, MZ.cw, MZ.ch); g.drawImage(MZ.img, 0, 0, MZ.cw, MZ.ch);
  drawMarks(g, p, MZ.cw, MZ.ch, Math.max(MZ.cw, MZ.ch) / 400 * 1.15);
  const done = p.marks.filter(m => m.p.length === 3);
  $('#mz-list').innerHTML = done.map((m, i) => `<span class="pill n" style="font-size:14px;padding:6px 12px">Angle ${i + 1}: ${Math.round(angleOf(p, m))}°</span>`).join('');
  const last = p.marks[p.marks.length - 1];
  const need = !last || last.p.length === 3 ? 3 : 3 - last.p.length;
  $('#mz-hint').textContent = last && last.p.length < 3 ? `Tap ${need} more point${need > 1 ? 's' : ''}. The second point is the joint.` : 'Tap three points: the start, the joint, then the end (for knee extension: hip, knee, ankle). Drag any point to adjust it.';
}
function mzPos(e){ const r = $('#mz-c').getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
function mzDown(e){
  if (!MZ) return; e.preventDefault();
  const [x, y] = mzPos(e), p = MZ.p;
  let best = null, bd = 30;
  p.marks.forEach((m, mi) => m.p.forEach(([px, py], pi) => { const d = Math.hypot((px - x) * MZ.cw, (py - y) * MZ.ch); if (d < bd){ bd = d; best = [mi, pi]; } }));
  if (best){ MZ.drag = best; $('#mz-c').setPointerCapture(e.pointerId); return; }
  let last = p.marks[p.marks.length - 1];
  if (!last || last.p.length === 3){ last = {p:[]}; p.marks.push(last); }
  last.p.push([x, y]); MZ.drag = [p.marks.length - 1, last.p.length - 1]; $('#mz-c').setPointerCapture(e.pointerId); drawMZ();
}
function mzMove(e){ if (!MZ || !MZ.drag) return; const [x, y] = mzPos(e); MZ.p.marks[MZ.drag[0]].p[MZ.drag[1]] = [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]; drawMZ(); }
function mzUp(){ if (MZ) MZ.drag = null; }
async function closeMZ(){
  if (!MZ) return; const p = MZ.p;
  p.marks = p.marks.filter(m => m.p.length === 3);
  await composite(p); MZ = null; $('#mz').hidden = true; save(); renderMain();
}

// (each photo's angles drawn onto it, for the cards and the report: made again when a fit is opened)
async function markPhotos(){
  let changed = false;
  for (const p of S.photos) if (p.src && p.marks.length && !p._comp){ await composite(p); changed = true; }
  if (changed && STEPS[S.step].id === 'photos') renderMain();
}

/* ---------------- insights ---------------- */
function changes(){
  const order = ['sadH','setback','drop','padDrop','hoods','barReach','padStack','padReach','stemL','spacers','stemA','barW','crank','tilt','sadW','padW','baseW','extLen','extA','noseToPad','noseToShifter','tipBar','tipShifter','postOff','hx','hy','sx','sy','nose','extFront'];
  return order.map(k => ALLROWS.find(r => r.k === k)).filter(r => r && applies(r) && (S.fit === 'tt' || !TTROWS.includes(r)))
    .map(r => ({r, ...deltaOf(r)})).filter(x => x.ch && isNum(x.d));
}
function lights(){
  const out = [];
  const add = (label, k, cl, show) => { const c = lightOf(k, cl); if (c) out.push({label, c, v:num(k) != null ? fmt(num(k)) + (cl === 'plank' ? ' s' : '°') : CNAME[c]}); };
  add('Sacrum angle (back flexibility)', 'backFlex', 'back');
  if (S.fit !== 'std'){
    add('Core stability (plank)', 'plank', 'plank');
    add('Hamstring, left', 'ham_L', 'ham'); add('Hamstring, right', 'ham_R', 'ham');
    add('Hip restriction, left', 'hipR_L', 'hip'); add('Hip restriction, right', 'hipR_R', 'hip');
    if (S.v.bio) out.push({label:'BioDynamic arch profile', c:S.v.bio, v:{r:'Low arch', y:'Medium arch', b:'High arch'}[S.v.bio]});
  }
  return out;
}
function anglesList(){
  const all = [['legExt','Leg extension','°'],['hipTop','Hip angle, top of stroke','°'],['sacral','Sacral angle','°','FT'],['kops','Knee over pedal spindle','cm'],['bmr','Body mass representation','cm'],['torso','Torso angle','°'],['backAngle','Back angle','°'],['shoulder','Shoulder angle','°'],['elbow','Elbow angle','°']];
  return all.filter(a => (a[3] || 'SFT').includes(fitCode())).map(([k, label, u]) => ({k, label, u, pre:num(k + '_pre'), post:num(k + '_post'), r:range(k)})).filter(a => a.pre != null || a.post != null);
}
function suggested(){
  const s = new Set(), L = (k, cl) => lightOf(k, cl), bad = c => c === 'r' || c === 'y';
  if (bad(L('ham_L','ham')) || bad(L('ham_R','ham'))) s.add('ham');
  if (bad(L('hipR_L','hip')) || bad(L('hipR_R','hip'))) s.add('hipflex');
  if (bad(L('backFlex','back')) || S.pain.lowback) s.add('catcow');
  if (bad(L('plank','plank'))) s.add('plank');
  if (val('shFwd') === 'Yes') s.add('pec');
  if ([val('knee_L'), val('knee_R'), val('kneeTrack_L'), val('kneeTrack_R')].some(x => x === 'Bends in' || x === 'Tracks in')) s.add('glute');
  if ((S.fit !== 'std' && (val('arch_L') === 'Low' || val('arch_R') === 'Low')) || S.pain.foot_L || S.pain.foot_R) s.add('calf');
  if (S.pain.neck) s.add('neck');
  return s;
}
// Stretching & strengthening, as the fitter writes it: one a line, "name — how much". "Suggest from the assessment"
// writes the ones the assessment calls for (suggested()) into it, to edit. A fit from before, with buttons ticked,
// starts from those.
const stretchLine = x => `${x.name} — ${x.dose}`;
function stretchText(){
  if (typeof S.v.stretchText === 'string') return S.v.stretchText;
  return Array.isArray(S.stretches) ? S.stretches.map(k => STRETCH.find(x => x.k === k)).filter(Boolean).map(stretchLine).join('\n') : '';
}
function draftStretches(){ return [...suggested()].map(k => STRETCH.find(x => x.k === k)).filter(Boolean).map(stretchLine).join('\n'); }
function draftSummary(){
  const c = Object.fromEntries(changes().map(x => [x.r.k, x])), v = S.v, out = [];
  const mm = x => fmt(Math.abs(x.d)) + ' mm';
  if (c.sadH) out.push(`${c.sadH.d > 0 ? 'Raised' : 'Lowered'} your saddle by ${mm(c.sadH)}${c.setback ? ` and moved it ${mm(c.setback)} ${c.setback.d < 0 ? 'forward' : 'back'}` : ''}.`);
  else if (c.setback) out.push(`Moved your saddle ${mm(c.setback)} ${c.setback.d < 0 ? 'forward' : 'back'}.`);
  if (filled(v.sadModel_post) && v.sadModel_post !== v.sadModel_pre) out.push(`Changed your saddle to a ${v.sadModel_post}${v.ischialW ? ` to suit your ${v.ischialW.toLowerCase()} sit-bone width` : ''}.`);
  if (c.tilt) out.push(`Adjusted saddle tilt from ${fmt(v.tilt_pre)}° to ${fmt(v.tilt_post)}°.`);
  if (c.drop || c.spacers || c.stemA) out.push(`${c.drop && c.drop.d < 0 ? 'Raised the front end' : 'Adjusted the front end'}${c.drop ? `, so the drop from saddle to bars is now ${fmt(v.drop_post)} mm (was ${fmt(v.drop_pre)} mm)` : ''}.`);
  if (c.hoods || c.stemL) out.push(`${c.hoods && c.hoods.d < 0 ? 'Shortened' : 'Changed'} your reach${c.stemL ? ` with a ${fmt(v.stemL_post)} mm stem` : ''}${c.hoods ? ` (saddle to hoods ${fmt(v.hoods_pre)} → ${fmt(v.hoods_post)} mm)` : ''}.`);
  if (c.barW) out.push(`Fitted ${fmt(v.barW_post)} mm handlebars${isNum(v.shWidth) ? ` to match your ${fmt(v.shWidth)} cm shoulders` : ''}.`);
  if (c.crank) out.push(`Changed cranks from ${fmt(v.crank_pre)} to ${fmt(v.crank_post)} mm to open your hip angle at the top of the stroke.`);
  if (filled(v.cleatR) || filled(v.cleatL)) out.push(`Cleats: left ${v.cleatL || 'unchanged'}; right ${v.cleatR || 'unchanged'}.`);
  const moved = anglesList().filter(a => a.r && a.pre != null && a.post != null && (a.pre < a.r[0] || a.pre > a.r[1]) && a.post >= a.r[0] && a.post <= a.r[1]);
  const PR = {legExt:'knee extension', hipTop:'hip angle at the top of the stroke', kops:'knee position over the pedal', torso:'torso angle', shoulder:'shoulder angle', elbow:'elbow angle'};
  if (moved.length) out.push('\nOn the bike, ' + moved.map(a => `your ${PR[a.k] || a.label.toLowerCase()} went from ${fmt(a.pre)}${a.u === '°' ? '°' : ' ' + a.u} to ${fmt(a.post)}${a.u === '°' ? '°' : ' ' + a.u}`).join(', ') + ', now inside the guide range.');
  return out.join(' ').replace(/ \n/g, '\n\n');
}
function followUp(){
  if (S.follow) return {title:'Keep in touch', body:'If anything changes, or a niggle comes back, call us on 01603 614400 and we’ll book you in.'};
  if (S.fit === 'std') return {title:'Follow-up appointment', body:'Book a follow-up for £25 if anything needs a tweak once you’ve done a few longer rides.'};
  const d = val('date') ? new Date(val('date') + 'T12:00:00') : new Date(); d.setDate(d.getDate() + 56);
  return {title:'Free follow-up', date:d, body:`Your complimentary 30-minute follow-up is due around ${d.toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'})}. We’ll check how the changes feel after eight weeks of riding.`};
}

function reportStepHTML(){
  const ch = changes().slice(0, 4), L = lights(), A = anglesList(), fu = followUp();
  const pains = Object.entries(S.pain).filter(([, v]) => v);
  const into = A.filter(a => a.r && a.post != null && a.post >= a.r[0] && a.post <= a.r[1]).length, measured = A.filter(a => a.r && a.post != null).length;
  return `<div class="sec"><div class="sec-h"><h2>Ready to send?</h2><span class="sec-count" data-x="readycount"></span></div><div class="ready" data-x="ready"></div></div>
  <div class="sec"><div class="sec-h"><h2>At a glance</h2><div class="right"><span class="sec-note">Worked out from what you entered</span>${canCompare() ? '<button type="button" class="btn sm dark" data-act="compare">Show the rider before &amp; after</button>' : ''}</div></div>
    <div class="ins">
      <div class="kc"><span class="k">Angles in range after</span><span class="v">${measured ? `${into} of ${measured}` : '–'}</span><span class="d">${A.filter(a => a.r && a.pre != null).length ? `${A.filter(a => a.r && a.pre != null && a.pre >= a.r[0] && a.pre <= a.r[1]).length} were in range before` : 'Add angles in On-bike'}</span></div>
      <div class="kc"><span class="k">Set-up changes</span><span class="v">${changes().length}</span><span class="d">${ch.length ? ch.slice(0, 2).map(x => esc(x.r.label) + ' ' + x.txt).join(', ') : 'Add before and after values'}</span></div>
      <div class="kc"><span class="k">Body flags</span><span class="v">${L.filter(x => x.c === 'r').length} red · ${L.filter(x => x.c === 'y').length} yellow</span><span class="d">${pains.length} discomfort area${pains.length === 1 ? '' : 's'} reported</span></div>
    </div>
    ${L.length ? `<ul class="list" style="margin-top:16px">${L.filter(x => x.c !== 'g').map(x => `<li><span class="pill ${x.c}">${CNAME[x.c]}</span><span>${esc(x.label)}: ${esc(x.v)}</span></li>`).join('')}</ul>` : ''}
  </div>
  <div class="sec"><div class="sec-h"><h2>Overview of set-up changes</h2><button type="button" class="btn sm" data-act="draft">Write it for me</button></div>
    <div class="fld"><label class="lab" for="i-summary">What we changed and why · this opens the client report</label><textarea id="i-summary" data-k="summary" style="min-height:160px" placeholder="Tap “Write it for me” to draft this from your measurements, then edit.">${esc(val('summary') || '')}</textarea></div></div>
  <div class="sec"><div class="sec-h"><h2>Stretching & strengthening</h2><button type="button" class="btn sm" data-act="stretch-draft">Suggest from the assessment</button></div>
    <div class="fld"><label class="lab" for="i-stretchText">The rider’s plan · one a line, e.g. Hamstring stretch — 3 × 30 s each leg, daily</label><textarea id="i-stretchText" data-k="stretchText" style="min-height:140px" placeholder="Type the stretches and exercises, or tap “Suggest from the assessment” to start from what the assessment found.">${esc(stretchText())}</textarea></div>
    <div id="stretch-msg"></div></div>
  <div class="sec"><div class="sec-h"><h2>Recommended products</h2></div>
    <div id="prods">${S.products.map((p, i) => `<div class="prow"><input type="text" id="pn-${i}" data-prod="${i}" data-f="n" value="${esc(p.n)}" placeholder="Product" aria-label="Product"><div class="num"><input type="text" inputmode="decimal" id="pp-${i}" data-prod="${i}" data-f="p" value="${esc(p.p)}" aria-label="Price"><span class="u">£</span></div><button type="button" class="x" data-act="prod-del" data-i="${i}" aria-label="Remove product">×</button></div>`).join('')}</div>
    <button type="button" class="btn sm" data-act="prod-add">+ Add product</button></div>
  <div class="sec"><div class="sec-h"><h2>Send to ${esc(val('first') || 'the client')}</h2><span class="sec-note">${esc(fu.title)}${fu.date ? ' · ' + fu.date.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) : ''}</span></div>
    <div class="send"><div style="display:flex;flex-direction:column;gap:12px">
      <div class="fld"><label class="lab" for="i-email2">Client email</label><input type="email" id="i-email2" data-k="email" value="${esc(val('email') || '')}"></div>
      <div class="row-btns"><button type="button" class="btn primary" data-act="pdf">Make PDF</button><button type="button" class="btn" data-act="preview">Preview report</button></div>
      <div class="row-btns"><a class="btn" id="mailto" href="${esc(mailtoHref())}">Open in Mail</a><button type="button" class="btn" data-act="copy-mail">Copy email</button></div>
      <div id="send-msg"></div>
      <div class="hint">On iPad, Make PDF then Share or email opens the share sheet: choose Mail and the report goes as an attachment.</div></div>
      <div><span class="lab">Email message</span><div class="mail" id="mail" style="margin-top:7px">${esc(mailText())}</div></div></div></div>`;
}
function mailtoHref(){
  const [subj, ...rest] = mailText().split('\n\n');
  return `mailto:${encodeURIComponent((val('email') || '').trim())}?subject=${encodeURIComponent(subj.replace(/^Subject: /, ''))}&body=${encodeURIComponent(rest.join('\n\n'))}`;
}
function mailText(){
  const fu = followUp(), first = val('first') || 'there';
  if (S.follow) return `Subject: Your Precision Fit follow-up report\n\nHi ${first},\n\nThanks for coming back in for your follow-up with ${val('fitter') || 'us'}. Your updated report is attached: it shows what we changed today, from where your fit on ${dayTxt(S.follow.date, {day:'numeric', month:'long'}) || 'your last visit'} left you, and your plan from here.\n\n${fu.body}\n\n${val('fitter') || 'The fit team'}\nPrecision Fit Studio, Pedal Revolution\n63–67 Bethel Street, Norwich NR2 1NR · 01603 614400\nprecisionfit@pedalrevolution.co.uk`;
  return `Subject: Your Precision Fit report, ${FITS[S.fit].name}\n\nHi ${first},\n\nThanks for coming in for your ${FITS[S.fit].name} with ${val('fitter') || 'us'}. Your report is attached: it has your new bike measurements, before and after photos, and the stretches we talked about.\n\n${fu.body}\n\nRide it for a couple of weeks and let us know how it feels.\n\n${val('fitter') || 'The fit team'}\nPrecision Fit Studio, Pedal Revolution\n63–67 Bethel Street, Norwich NR2 1NR · 01603 614400\nprecisionfit@pedalrevolution.co.uk`;
}

/* ---------------- starting position: the rider's body measurements ---------------- */
function startHTML(){
  const inp = (k, label, unit) => `<div class="fld"><label class="lab" for="i-${k}">${label}</label>${inputHTML(k, {t:'num', unit, label})}</div>`;
  return `<div class="sp-sub">Body measurements</div>
    <div class="sp-grid">${inp('height', 'Height', 'cm')}${inp('inseam', 'Inseam', 'cm')}${inp('shWidth', 'Shoulders', 'cm')}
      ${S.fit === 'std' ? '' : inp('footAng_L', 'Foot angle L', '°') + inp('footAng_R', 'Foot angle R', '°')}</div>
    <p class="hint" style="margin:12px 0 0">The same measurements as the off-bike assessment: change them in either place.</p>
    ${S.fit === 'tt' ? `<div class="sp-sub" style="margin-top:22px">Triathlon starting point</div>
      <div class="grid">${fieldHTML(SG('ability','Ability',['Novice','Finisher','Competitor'],{f:'T'}))}${fieldHTML(SG('distance','Race distance',['Ironman','Long','Sprint'],{f:'T'}))}</div>
      <div class="tts" data-x="ttscore"></div>` : ''}`;
}
// Precision Fit's triathlon form: ability, distance, flexibility and the plank, 0 to 2 each, and +1 where the elbows touch
// at 90°; the total picks the column of starting points (seatpost, knee bend at the bottom, saddle to arm pad drop).
const TT_START = {cols:['0 to 3', '4 to 6', '7 to 10'], rows:[['Aluminium seatpost', '20 mm set back', '20 mm fore', '20 mm fore'], ['Carbon seatpost', '15 mm set back', '15 mm fore', '48 mm fore'],
  ['Saddle height', '40 to 35° knee bend', '35° knee bend', '35 to 30° knee bend'], ['Saddle to arm pad drop', '2 cm drop', '6 cm drop', '10 cm drop']]};
function flexColor(){ const cs = [lightOf('ham_L', 'ham'), lightOf('ham_R', 'ham'), lightOf('backFlex', 'back')].filter(Boolean); return cs.length ? (cs.includes('r') ? 'r' : cs.includes('y') ? 'y' : 'g') : null; }
function ttScore(){
  const pts = {r:0, y:1, g:2}, fl = flexColor(), pl = lightOf('plank', 'plank');
  const parts = [['Ability', val('ability') || null, {Novice:0, Finisher:1, Competitor:2}[val('ability')]], ['Distance', val('distance') || null, {Ironman:0, Long:1, Sprint:2}[val('distance')]],
    ['Flexibility', fl ? CNAME[fl] : null, fl ? pts[fl] : undefined], ['Plank', pl ? `${CNAME[pl]}${num('plank') != null ? ` · ${num('plank')} s` : ''}` : null, pl ? pts[pl] : undefined],
    ['Elbows touch at 90°', val('elbows') || null, val('elbows') === 'Yes' ? 1 : val('elbows') === 'No' ? 0 : undefined]];
  const known = parts.filter(p => p[2] !== undefined), total = known.reduce((a, p) => a + p[2], 0);
  return {parts, total, complete:known.length === parts.length, band:total <= 3 ? 0 : total <= 6 ? 1 : 2};
}
function ttScoreHTML(){
  const t = ttScore();
  return `<div class="tts-parts">${t.parts.map(([n, v, p]) => `<div><span>${esc(n)}</span><b>${v ? esc(v) : '<span class="hint">not yet</span>'}</b><i>${p === undefined ? '–' : '+' + p}</i></div>`).join('')}
      <div class="tts-total"><span>Total</span><b>${t.total}</b><i>${t.complete ? 'of 10' : 'so far'}</i></div></div>
    <div class="tts-tbl"><div></div>${TT_START.cols.map((c, i) => `<div class="tts-h${i === t.band ? ' on' : ''}">${c}</div>`).join('')}
      ${TT_START.rows.map(r => `<div class="tts-r">${esc(r[0])}</div>${r.slice(1).map((x, i) => `<div class="tts-c${i === t.band ? ' on' : ''}">${esc(x)}</div>`).join('')}`).join('')}</div>
    <p class="hint" style="margin:8px 0 0">${t.complete ? `Start from the highlighted column (${TT_START.cols[t.band]}), then fine-tune on the bike.` : 'Flexibility, plank and elbows come from the off-bike assessment; answer the rest to complete the score.'}</p>`;
}

// The stretching plan's lines: "name — how much" (or a colon), each a card in the report
const planLines = () => stretchText().split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = /^(.+?)\s+[—–-]\s+(.+)$/.exec(l) || /^([^:]+):\s*(.+)$/.exec(l); return m ? {name:m[1], dose:m[2]} : {name:l, dose:''}; });

/* ---------------- the bike set-up card: the report's last page ---------------- */
// The After values a mechanic needs to put the position back (front), and where each is measured from (back): two A5
// halves of one A4 page, to cut along the line and keep with the bike. Only rows with a value appear; with none, no card.
function cardCols(){
  const v = S.v, P = k => v[k + '_post'], has = k => filled(P(k)), mm = k => `${fmt(P(k))} mm`, row = (label, value, sub) => ({label, value, sub});
  const stem = has('stemL') || has('stemA') ? [has('stemL') ? mm('stemL') : '', has('stemA') ? `${P('stemA') > 0 ? '+' : ''}${fmt(P('stemA'))}°` : ''].filter(Boolean).join(' · ') : '';
  const left = [has('sadH') && row('Saddle height', mm('sadH'), 'BB centre to saddle top'), has('setback') && row('Saddle setback', mm('setback'), 'Saddle tip behind BB'),
    has('tilt') && row('Saddle tilt', P('tilt') === 0 ? '0° level' : `${fmt(P('tilt'))}°`), (has('sadModel') || has('sadW')) && row('Saddle', [P('sadModel'), has('sadW') && !String(P('sadModel') || '').includes(String(P('sadW'))) ? `${P('sadW')} mm` : ''].filter(Boolean).join(' · ')),
    has('crank') && row('Crank length', mm('crank')), v.cleatL && row('Cleat, left', v.cleatL)].filter(Boolean);
  const right = S.fit === 'tt'
    ? [has('padStack') && row('Arm pad stack', mm('padStack')), has('padReach') && row('Arm pad reach', mm('padReach')), has('padDrop') && row('Saddle to arm pad drop', mm('padDrop')),
       has('padW') && row('Arm pad width', mm('padW'), 'Centre to centre'), has('extLen') && row('Extension', [mm('extLen'), has('extA') ? `${fmt(P('extA'))}°` : ''].filter(Boolean).join(' · ')),
       stem && row('Stem', stem), v.cleatR && row('Cleat, right', v.cleatR)]
    : [has('barReach') ? row('Saddle to bar reach', mm('barReach')) : has('hoods') ? row('Saddle to hoods reach', mm('hoods')) : has('tipBar') && row('Saddle tip to bar', mm('tipBar')),
       has('drop') && row('Saddle to bar drop', mm('drop')), stem && row('Stem', stem), has('spacers') && row('Headset spacers', mm('spacers')),
       has('barW') && row('Handlebar width', mm('barW')), v.cleatR && row('Cleat, right', v.cleatR)];
  return [left, right.filter(Boolean)];
}
// The bike on the card's back, drawn in millimetres from the BB (x forward, y up) and scaled into the picture: a road
// bike, or a TT bike for a TT fit. Where the rider's numbers decide a place (saddle height and setback or nose, pad
// stack and reach, extension) the drawing uses them, so the marks sit where the numbers say; the frame itself is a
// typical 56. Inline attributes only: in the PDF it's drawn as a picture, away from the page's styles.
function bikeSVG(){
  const v = S.v, num2 = k => isNum(v[k + '_post']) ? v[k + '_post'] : null, tt = S.fit === 'tt';
  const k = 0.36, OX = 290, OY = 330, X = x => (OX + x * k).toFixed(1), Y = y => (OY - y * k).toFixed(1), P = (x, y) => `${X(x)} ${Y(y)}`;
  const INK = '#1c1f24', RED = '#ed1c24', MUTE = '#676b73';
  const line = (pts, w, col = INK, extra = '') => `<path d="M${pts.map(p => P(p[0], p[1])).join(' L')}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const circ = (x, y, r, w, col = INK, fill = 'none') => `<circle cx="${X(x)}" cy="${Y(y)}" r="${(r * k).toFixed(1)}" stroke="${col}" stroke-width="${w}" fill="${fill}"/>`;
  const label = (x, y, s, anchor = 'start', col = RED, size = 16) => `<text x="${X(x)}" y="${Y(y)}" text-anchor="${anchor}" fill="${col}" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="${size}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${esc(s)}</text>`;
  const note = (x, y, s, anchor = 'middle') => `<text x="${X(x)}" y="${Y(y)}" text-anchor="${anchor}" fill="${MUTE}" font-family="Barlow, Arial, sans-serif" font-size="12">${esc(s)}</text>`;
  const dimH = (x1, x2, y, tick = 14) => line([[x1, y], [x2, y]], 2, RED) + line([[x1, y - tick], [x1, y + tick]], 2, RED) + line([[x2, y - tick], [x2, y + tick]], 2, RED);
  const dimV = (x, y1, y2, tick = 14) => line([[x, y1], [x, y2]], 2, RED) + line([[x - tick, y1], [x + tick, y1]], 2, RED) + line([[x - tick, y2], [x + tick, y2]], 2, RED);
  const guide = (pts) => line(pts, 1.4, RED, 'stroke-dasharray="5 5"');
  const R = 340, rearAx = [-404, 70], frontAx = tt ? [600, 70] : [591, 70];
  const sta = (tt ? 78 : 73.5) * Math.PI / 180, ax = [-Math.cos(sta), Math.sin(sta)];
  const H = num2('sadH') ?? 734, seat = [ax[0] * H, ax[1] * H];                       // saddle top, on the seat tube's line
  const back = tt ? (num2('nose') ?? 50) : (num2('setback') ?? 55);                   // saddle tip (or nose) behind the BB
  const sLen = tt ? 250 : 270, tip = [-back, seat[1]], tail = [-back - sLen, seat[1]];
  let g = '';
  // wheels: tyre, rim, hub (a TT bike: a disc behind, a deep rim in front)
  if (tt){
    g += circ(rearAx[0], rearAx[1], 318, 0, 'none', '#d9dbdf') + circ(rearAx[0], rearAx[1], 34, 2, '#b9bdc4', '#cfd2d7');
    g += circ(frontAx[0], frontAx[1], 276, 74 * k, '#d5d8dc') + circ(frontAx[0], frontAx[1], 238, 1.2, '#b9bdc4');   // deep rim
  } else {
    for (const a of [rearAx, frontAx]){ g += circ(a[0], a[1], 312, 2.5, '#8a9099'); for (let i = 0; i < 16; i++){ const t = i * Math.PI / 8; g += line([[a[0] + 14 * Math.cos(t), a[1] + 14 * Math.sin(t)], [a[0] + 305 * Math.cos(t + .35), a[1] + 305 * Math.sin(t + .35)]], .6, '#a9aeb5'); } }
  }
  for (const a of [rearAx, frontAx]) g += circ(a[0], a[1], R - 12, 9, INK) + circ(a[0], a[1], 16, 3, INK, '#ffffff');
  // frame
  const w = tt ? 13 : 8.5;
  const cluster = tt ? [ax[0] * 470, ax[1] * 470] : [ax[0] * 540, ax[1] * 540];
  const htTop = tt ? [410, 515] : [385, 575], hta = 73 * Math.PI / 180, htLen = tt ? 115 : 165;
  const htBot = [htTop[0] + Math.cos(hta) * htLen, htTop[1] - Math.sin(hta) * htLen];
  g += line([rearAx, [0, 0]], w * .75) + line([rearAx, cluster], w * .65);                  // chain and seat stays
  g += line([[0, 0], cluster], w) + line([[cluster[0] + 6, cluster[1] - 10], [htTop[0] - 4, htTop[1] - 14]], w);   // seat tube, top tube
  g += line([[0, 0], htBot], w * 1.15) + line([htTop, htBot], w * 1.25);                   // down tube, head tube
  // fork: down the steering axis, curving forward to the axle (its rake)
  const axisX = htBot[0] + (htBot[1] - frontAx[1]) / Math.tan(hta), fc = [axisX, frontAx[1] + (htBot[1] - frontAx[1]) * .3];
  g += `<path d="M${P(htBot[0], htBot[1])} Q${P(fc[0], fc[1])} ${P(frontAx[0], frontAx[1])}" stroke="${INK}" stroke-width="${w * .7}" fill="none" stroke-linecap="round"/>`;
  // seatpost and saddle (on the post's line, where the numbers put it)
  g += line([[cluster[0] - 2, cluster[1]], [seat[0], seat[1] - 18]], tt ? 9 : 6, '#3a3e45');
  g += `<path d="M${P(tail[0], tail[1] - 8)} Q${P(tail[0] + 30, tail[1] + 22)} ${P(tail[0] + 90, tail[1] + 16)} L${P(tip[0] - 40, tip[1] + 6)} Q${P(tip[0], tip[1] + 4)} ${P(tip[0] + 6, tip[1] - 4)} L${P(tail[0] + 20, tail[1] - 16)} Z" fill="${INK}"/>`;
  g += line([[seat[0] - 40, seat[1] - 14], [seat[0] + 40, seat[1] - 14]], 3, '#3a3e45');
  // crankset: chainring, crank, pedal
  const crank = num2('crank') ?? 170, ca = -68 * Math.PI / 180, pedal = [Math.cos(ca) * crank, Math.sin(ca) * crank];
  g += circ(0, 0, 104, 3.5, INK) + circ(0, 0, 92, 1, '#8a9099');
  g += line([[0, 0], pedal], 7, '#2a2e35') + line([[pedal[0] - 45, pedal[1]], [pedal[0] + 45, pedal[1]]], 6, '#2a2e35') + circ(0, 0, 22, 0, 'none', INK);
  // cockpit
  let barPoint, cockpit = '';
  if (!tt){
    const sp = num2('spacers') ?? 25, steerTop = [htTop[0] - Math.cos(hta) * (sp + 12), htTop[1] + Math.sin(hta) * (sp + 12)];
    const stemL = num2('stemL') ?? 100, stemA = ((num2('stemA') ?? -7) + 17) * Math.PI / 180;   // stem angle from the steerer's normal
    const clamp = [steerTop[0] + Math.cos(stemA) * stemL, steerTop[1] + Math.sin(stemA) * stemL];
    cockpit += line([htTop, steerTop], 10, '#3a3e45') + line([steerTop, clamp], 11, INK);
    // drop bar: forward to the hoods' bend, down the drop, back underneath
    cockpit += `<path d="M${P(clamp[0], clamp[1])} C${P(clamp[0] + 90, clamp[1] + 4)} ${P(clamp[0] + 112, clamp[1] - 30)} ${P(clamp[0] + 100, clamp[1] - 70)} C${P(clamp[0] + 88, clamp[1] - 120)} ${P(clamp[0] + 50, clamp[1] - 132)} ${P(clamp[0] + 8, clamp[1] - 122)}" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    cockpit += `<path d="M${P(clamp[0] + 70, clamp[1] + 2)} Q${P(clamp[0] + 96, clamp[1] + 30)} ${P(clamp[0] + 110, clamp[1] + 18)} L${P(clamp[0] + 104, clamp[1] - 26)} Z" fill="${INK}"/>`;   // hood
    barPoint = clamp;
  } else {
    const padStack = num2('padStack') ?? 620, padReach = num2('padReach') ?? 430, extLen = num2('extLen') ?? 300, extA = (num2('extA') ?? 10) * Math.PI / 180;
    const stemEnd = [htTop[0] + 70, htTop[1] - 8], pad = [padReach, padStack], padFront = [padReach + 110, padStack];
    const extTip = [padReach + Math.cos(extA) * extLen, padStack - 20 + Math.sin(extA) * extLen];
    cockpit += line([[htTop[0] - 6, htTop[1] + 4], stemEnd], 12, INK);
    cockpit += `<path d="M${P(stemEnd[0], stemEnd[1])} C${P(stemEnd[0] + 80, stemEnd[1] - 4)} ${P(stemEnd[0] + 110, stemEnd[1] - 30)} ${P(stemEnd[0] + 120, stemEnd[1] - 70)}" stroke="${INK}" stroke-width="9" fill="none" stroke-linecap="round"/>`;   // base bar
    cockpit += line([[pad[0] + 40, stemEnd[1] + 4], [pad[0] + 40, padStack - 20]], 8, '#3a3e45');    // riser to the pads
    cockpit += line([pad, padFront], 12, INK) + line([[pad[0] + 20, padStack - 20], extTip], 6, INK) + line([extTip, [extTip[0] - 6, extTip[1] + 30]], 6, INK);   // pad, extension, hand
    barPoint = pad;
    // TT marks: pad stack and reach (from the BB), the extension, the nose
    g += cockpit;
    // (pad stack beside the front wheel, clear of the rim: from the BB's height to the pad's)
    const xs = frontAx[0] + R + 30;
    g += guide([[0, 0], [xs + 16, 0]]) + guide([[pad[0], padStack + 16], [pad[0], 0]]) + guide([[padFront[0], padStack], [xs + 16, padStack]]);
    g += dimV(xs, 0, padStack) + label(xs + 14, padStack / 2 + 40, 'Pad stack') + label(xs + 14, padStack / 2 - 4, fmt(padStack));
    g += guide([[0, 0], [0, padStack + 130]]) + dimH(0, pad[0], padStack + 110) + label(pad[0] / 2, padStack + 126, `Pad reach ${fmt(padReach)}`, 'middle');
    if (num2('extLen') != null) g += label(extTip[0] + 10, extTip[1] + 10, `Extension ${fmt(extLen)}`);
    if (num2('extFront') != null) g += dimH(0, extTip[0], padStack + 210) + label(extTip[0] / 2 + 60, padStack + 226, `Tip ahead of BB ${fmt(num2('extFront'))}`, 'middle');
    if (num2('nose') != null) g += guide([[0, seat[1] + 60], [0, padStack + 130]]) + dimH(tip[0], 0, seat[1] + 60) + label(tip[0] - 20, seat[1] + 76, `Nose behind BB ${fmt(back)}`, 'end');
  }
  if (!tt){
    g += cockpit;
    const reach = num2('barReach') != null ? ['Reach', num2('barReach')] : num2('hoods') != null ? ['Reach to hoods', num2('hoods')] : num2('tipBar') != null ? ['Saddle tip to bar', num2('tipBar')] : null;
    if (num2('setback') != null) g += guide([[0, 0], [0, seat[1] + 100]]) + dimH(Math.min(tip[0], 0), Math.max(tip[0], 0), seat[1] + 60) + label(Math.max(tip[0], 0) + 24, seat[1] + 54, `Setback ${fmt(back)}`);
    if (reach) g += dimH(tip[0], barPoint[0], seat[1] + 150) + label((tip[0] + barPoint[0]) / 2, seat[1] + 166, `${reach[0]} ${fmt(reach[1])}`, 'middle');
    if (num2('drop') != null){
      const xr = barPoint[0] + 200;
      g += guide([[tip[0] + 30, seat[1]], [xr + 20, seat[1]]]) + guide([[barPoint[0] + 20, barPoint[1]], [xr + 20, barPoint[1]]]);
      g += dimV(xr, barPoint[1], seat[1], 10) + label(xr + 26, (barPoint[1] + seat[1]) / 2 - 8, `Drop ${fmt(num2('drop'))}`);
    }
  }
  // saddle height, along the seat tube's line, both bikes
  if (num2('sadH') != null){
    const at = H * 0.72, pt = [ax[0] * at, ax[1] * at];
    g += line([[0, 0], seat], 2, RED, 'stroke-dasharray="7 5"') + line([[pt[0] - 150, pt[1]], pt], 1.6, RED);
    g += label(pt[0] - 160, pt[1] - 6, `Saddle height ${fmt(H)}`, 'end');
  }
  g += note(0, -200, 'BB centre') + (num2('crank') != null ? note(pedal[0] + 70, pedal[1] - 10, `Crank ${fmt(crank)}`, 'start') : '');
  return `<svg viewBox="0 0 760 440" width="714" height="413" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}
function cardPages(){
  const v = S.v, P = k => v[k + '_post'], name = fullName() || 'Rider';
  const when = v.date ? new Date(v.date + 'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) : '';
  const [L, Rr] = cardCols(), rows = list => list.map(r => `<div class="sc-row${String(r.value).length > 20 ? ' long' : ''}"><span>${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><b>${esc(r.value)}</b></div>`).join('');
  const front = `<div class="sc-page"><div class="sc-band"><img src="${LOGO}" alt=""><div><div class="k">Keep this with your bike</div><div class="t">Bike set-up card</div></div></div>
    <div class="sc-who"><div>Rider<b>${esc(name)}</b></div><div>Bike<b>${esc([v.bike, v.frame].filter(Boolean).join(' · ') || '–')}</b></div><div>Fitted<b>${esc([when, v.fitter].filter(Boolean).join(' · '))}</b></div></div>
    <div class="sc-grid"><div>${rows(L)}</div><div>${rows(Rr)}</div></div>
    ${!L.length && !Rr.length ? '<p class="sc-empty">Add the bike’s After measurements to fill this card.</p>' : ''}
    <div class="sc-foot">Being serviced, rebuilt or packed for travel? Give this card to the mechanic: these numbers put your position back exactly. Questions: Pedal Revolution, 63–67 Bethel Street, Norwich · 01603 614400</div></div>`;
  // the back: where each is measured from, with this rider's numbers on it
  const svg = bikeSVG();
  const back = `<div class="sc-page"><div class="sc-back"><h3>Where we measure from</h3><p>All in millimetres, from the centre of the bottom bracket (BB) and the top of the saddle, with the bike level.</p>${svg}</div>
    <div class="sc-foot">Measured at Pedal Revolution’s Precision Fit Studio${when ? ` on ${esc(when)}` : ''}. Your full fit report has the angles behind these numbers.</div></div>`;
  return [front, back];
}
/* ---------------- feet, standing: the form's footprints, a line drawn along each foot ---------------- */
// Each foot is drawn in a 100 × 200 box, seen from above (the left foot's big toe on its right, the inside). The line
// runs from the middle of the heel (50, 180) along the foot; its angle from straight ahead is the foot angle, toe out
// counted positive (footAng_L / footAng_R, the boxes beneath). Drag on a foot to draw it; type an angle to set it.
// Inline attributes only, so the report's copy draws the same in the PDF.
const FOOT_PATH = 'M48 196C32 196 26 184 27 168C28 152 36 140 36 124C36 110 22 96 22 76C22 54 40 44 56 46C74 48 82 62 80 84C78 108 70 128 70 150C70 172 66 196 48 196Z';
const FOOT_TOES = [[34, 30, 10, 13], [52, 22, 6, 8], [63, 26, 5.5, 7], [72, 33, 5, 6], [79, 42, 4.5, 5.5]];
const FOOT_X = {L:30, R:170}, FOOT_Y = 26, HEEL = [50, 180], FOOT_LINE = 156;
function footShape(side){
  const m = side === 'L' ? ' transform="translate(100 0) scale(-1 1)"' : '';   // (the left foot: the right one turned over)
  return `<g${m}><path d="${FOOT_PATH}" fill="#c3c6cb"/>${FOOT_TOES.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#c3c6cb"/>`).join('')}</g>`;
}
// a foot's angle (toe out +) as the direction of its line in the drawing, and back
const footEnd = (side, out) => { const a = (side === 'L' ? -out : out) * Math.PI / 180; return [HEEL[0] + Math.sin(a) * FOOT_LINE, HEEL[1] - Math.cos(a) * FOOT_LINE]; };
const footOut = (side, x, y) => { const d = Math.atan2(x - HEEL[0], HEEL[1] - y) * 180 / Math.PI; return Math.max(-45, Math.min(45, Math.round(side === 'L' ? -d : d))); };
const footWord = out => out == null ? 'Drag along the foot' : out === 0 ? 'Straight' : `${Math.abs(out)}° toe ${out > 0 ? 'out' : 'in'}`;
function feetSVG(mode){
  const rider = mode !== 'example', W = 300, H = 250;
  const foot = side => {
    const out = rider ? num('footAng_' + side) : 0, [ex, ey] = out == null ? [0, 0] : footEnd(side, out);
    const line = out == null ? '' : rider
      ? `<line x1="${HEEL[0]}" y1="${HEEL[1]}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#e3141c" stroke-width="3.2" stroke-linecap="round"/><circle cx="${HEEL[0]}" cy="${HEEL[1]}" r="4.5" fill="#e3141c"/>`
      : `<line x1="50" y1="180" x2="50" y2="24" stroke="#8a8f97" stroke-width="2"/><circle cx="50" cy="180" r="3.5" fill="#8a8f97"/>`;
    const guide = rider ? `<line x1="50" y1="186" x2="50" y2="14" stroke="#9aa0a8" stroke-width="1" stroke-dasharray="3 4"/>` : '';
    return `<g transform="translate(${FOOT_X[side]} ${FOOT_Y})" ${rider && mode === 'rider' ? `data-footpad="${side}" style="cursor:crosshair"` : ''}>
      <rect x="-14" y="-14" width="128" height="222" fill="transparent"/>${footShape(side)}${guide}${line}</g>
      <text x="${FOOT_X[side] + 50}" y="${H - 8}" text-anchor="middle" font-family="Barlow, Arial, sans-serif" font-size="13" font-weight="700" fill="#3a3f47">${side}${rider ? ` · ${esc(footWord(out))}` : ''}</text>`;
  };
  const divider = `<line x1="${W / 2}" y1="8" x2="${W / 2}" y2="${H - 26}" stroke="${rider ? '#3a3f47' : '#9aa0a8'}" stroke-width="${rider ? 2 : 1.4}" ${rider ? '' : 'stroke-dasharray="3 3"'}/>`;
  return `<svg viewBox="0 0 ${W} ${H}" ${mode === 'report' ? 'width="300" height="250"' : ''} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${rider ? 'The rider’s feet, standing, with a line along each foot' : 'Neutral example: a straight line along each foot'}">
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="#ffffff" stroke="#d6d3ce" stroke-width="1.5" rx="6"/>${divider}${foot('L')}${foot('R')}</svg>`;
}
function feetHTML(){
  return `<div class="fld wide"><span class="lab">Foot angle standing <small>· drag along each of the rider’s feet, from the heel, or type the angle</small></span>
    <div class="feet"><figure class="feet-ex"><figcaption>Neutral example</figcaption>${feetSVG('example')}</figure>
      <figure class="feet-rider"><figcaption>Rider</figcaption><div data-x="feetdraw">${feetSVG('rider')}</div></figure></div></div>`;
}
// drawing a line: from the heel to wherever the finger is, until it lifts
let FOOTDRAG = null;
function footAt(e, g){
  const svg = g.ownerSVGElement, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(g.getScreenCTM().inverse());
  return footOut(g.dataset.footpad, p.x, p.y);
}
function footSet(side, out){
  S.v['footAng_' + side] = out;
  const inp = $('#i-footAng_' + side); if (inp) inp.value = out;
  const box = $('[data-x="feetdraw"]'); if (box) box.innerHTML = feetSVG('rider');
}
document.addEventListener('pointerdown', e => {
  const g = e.target.closest && e.target.closest('[data-footpad]'); if (!g) return;
  e.preventDefault(); FOOTDRAG = g.dataset.footpad; footSet(FOOTDRAG, footAt(e, g));
});
document.addEventListener('pointermove', e => {
  if (!FOOTDRAG) return;
  const g = $(`[data-footpad="${FOOTDRAG}"]`); if (g){ e.preventDefault(); footSet(FOOTDRAG, footAt(e, g)); }
}, {passive:false});
['pointerup', 'pointercancel'].forEach(n => document.addEventListener(n, () => { if (FOOTDRAG){ FOOTDRAG = null; save(); refresh(); renderRail(); } }));

/* ---------------- client report ---------------- */
/* The client's report: its sections one after another down A4 pages, a new page only where the next one won't fit. A
   table or list of angles carries on over a page (its heading again, marked continued); anything else moves whole. Each
   block is measured as it'll be drawn (in #cap, at the page's width), so the preview and the PDF are the same pages. */
const PAGE_H = 1123, FOOT_H = 70, TOP_PAD = 26, SAFE = 4;
function reportBlocks(){
  const v = S.v, fit = FITS[S.fit], name = fullName() || 'Client';
  const dateTxt = v.date ? new Date(v.date + 'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'}) : '';
  const ch = changes(), A = anglesList(), Ls = lights(), u = x => x === '°' ? '°' : ' ' + x;
  const sec = (title, body) => `<div class="rp-sec">${title ? `<h3 class="rp-h">${title}</h3>` : ''}${body}</div>`;
  const B = [];
  const FU = !!S.follow, was = FU ? 'At your fit' : 'Pre-fit', now = FU ? 'Today' : 'Post-fit';
  B.push({html:`<div class="rp-meta"><div><span>Customer</span><b>${esc(name)}</b></div><div><span>Date</span><b>${esc(dateTxt)}</b></div><div><span>Technician</span><b>${esc(v.fitter || '')}</b></div><div><span>${FU ? 'Follow-up to' : 'Fit'}</span><b>${esc(FU ? `${fit.name}, ${dayTxt(S.follow.date, {day:'numeric', month:'long', year:'numeric'})}` : fit.name)}</b></div>
    <div><span>Bike</span><b>${esc(v.bike || '')}</b></div><div><span>Frame size</span><b>${esc(v.frame || '')}</b></div><div><span>Pedals</span><b>${esc(v.pedals || '')}</b></div><div><span>Shoes</span><b>${esc(v.shoes || '')}</b></div></div>`});
  if (FU && (v.since || v.sinceNote)) B.push({html:sec('Since your fit', `${v.since ? `<p class="rp-p"><b>How it’s felt:</b> ${esc(v.since)}</p>` : ''}${v.sinceNote ? `<p class="rp-p">${esc(v.sinceNote)}</p>` : ''}`)});
  if (FU && !ch.length) B.push({html:sec('Changes today', '<p class="rp-p">Your position is as your fit left it: no changes were needed.</p>')});
  if (ch.length) B.push({html:sec(FU ? 'Changes today' : 'Key changes', `<div class="rp-kcs">${ch.slice(0, 4).map(x => `<div class="rp-kc"><span>${esc(x.r.label)}</span><b>${fmt(v[x.r.k + '_pre'])} → ${fmt(v[x.r.k + '_post'])}</b><i>${x.txt}</i></div>`).join('')}</div>`)});
  if (v.summary) B.push({html:sec('What we changed and why', `<p class="rp-p">${esc(v.summary)}</p>`)});
  if (A.length) B.push({title:'Your position on the bike', head:`<p class="rp-p" style="color:var(--p-mute);font-size:12.5px">${FU ? 'Hollow dot: where your fit left you. Solid dot: today.' : 'Hollow dot: before the fit. Solid dot: after.'} The green band is the range we aim for.</p>`, foot:'',
    rows:A.map(a => { const ok = a.r && a.post != null ? a.post >= a.r[0] && a.post <= a.r[1] : null;
      return `<div class="rp-ang"><div><div class="nm">${esc(a.label)}</div><div style="font-size:11.5px;color:var(--p-mute)">${a.r ? guideTxt(a.r, a.u) : 'Recorded'}</div></div>
        <div class="val">${a.pre != null ? fmt(a.pre) + u(a.u) : '–'} → ${a.post != null ? fmt(a.post) + u(a.u) : '–'}</div>
        <div>${gaugeOnly(a.k)}</div><div>${ok == null ? '' : `<span class="rp-pill ${ok ? 'g' : 'r'}">${ok ? 'In range' : 'Outside'}</span>`}</div></div>`; })});
  const cell = (r, k) => esc(r.t === 'text' ? v[k] ?? '' : v[k] != null && v[k] !== '' ? fmt(v[k]) + u(r.u) : '');
  const trs = rows => rows.filter(applies).filter(r => filled(v[r.k + '_pre']) || filled(v[r.k + '_post'])).map(r => { const d = deltaOf(r);
    return `<tr><td>${esc(r.label)}</td><td>${cell(r, r.k + '_pre')}</td><td class="c">${cell(r, r.k + '_post')}</td><td class="${d.ch ? 'ch' : ''}">${d.txt === '–' ? '' : d.txt}</td></tr>`; });
  const TH = `<table class="rp-tbl"><thead><tr><th style="width:36%">Measurement</th><th>${was}</th><th>${now}</th><th>Change</th></tr></thead><tbody>`;
  const bike = trs(BIKE);
  if (bike.length) B.push({title:'Bike measurements', head:TH, foot:'</tbody></table>', rows:bike,
    tail:'<p class="rp-p" style="font-size:11.5px;color:var(--p-mute);margin-top:10px">All measurements in millimetres unless shown. Keep this report with your bike: it lets any mechanic put your position back exactly.</p>'});
  if (v.cleatL || v.cleatR) B.push({html:sec('Cleats', `<ul class="rp-lst"><li><span>Left</span><b>${esc(v.cleatL || '–')}</b></li><li><span>Right</span><b>${esc(v.cleatR || '–')}</b></li></ul>`)});
  if (S.fit === 'tt'){ const t = ttScore(); if (t.complete) B.push({html:sec('Triathlon starting point', `<p class="rp-p">Score ${t.total} of 10 (${esc(TT_START.cols[t.band])}): ${TT_START.rows.map(r => `${esc(r[0].toLowerCase())} ${esc(r[t.band + 1])}`).join(', ')}.</p>`)}); }
  const pains = Object.entries(S.pain).filter(([, x]) => x);
  const obs = [['Arch height (L / R)', S.fit !== 'std' && [v.arch_L, v.arch_R].some(Boolean) ? `${v.arch_L || '–'} / ${v.arch_R || '–'}` : ''], ['Knee alignment (L / R)', S.fit !== 'std' && (v.knee_L || v.knee_R) ? `${v.knee_L || '–'} / ${v.knee_R || '–'}` : ''],
    ['Lower leg (L / R)', S.fit !== 'std' && (v.lowerLeg_L || v.lowerLeg_R) ? `${v.lowerLeg_L || '–'} / ${v.lowerLeg_R || '–'}` : ''],
    ['Pelvis', S.fit !== 'std' ? v.pelvis : ''], ['Hip width', S.fit !== 'std' && isNum(v.hipW) ? v.hipW + ' cm' : ''],
    ['Thigh diameter (L / R)', S.fit !== 'std' && (isNum(v.thigh_L) || isNum(v.thigh_R)) ? `${fmt(v.thigh_L)} / ${fmt(v.thigh_R)} cm` : ''],
    ['Selle Italia saddle', S.fit !== 'std' ? v.idSaddle : ''], ['Sit-bone width', v.ischialW || (isNum(v.ischial) ? v.ischial + ' mm' : '')], ['Shoulder width', isNum(v.shWidth) ? v.shWidth + ' cm' : ''],
    ['Shoulders drawn forward', S.fit !== 'std' ? v.shFwd : ''], ['Inseam', isNum(v.inseam) ? v.inseam + ' cm' : ''], ['Knee tracking on bike (L / R)', S.fit !== 'std' && (v.kneeTrack_L || v.kneeTrack_R) ? `${v.kneeTrack_L || '–'} / ${v.kneeTrack_R || '–'}` : '']].filter(x => x[1]);
  if (Ls.length || obs.length) B.push({html:`<div class="rp-two">${Ls.length ? sec('Mobility & stability', `<ul class="rp-lst">${Ls.map(x => `<li><span>${esc(x.label)}</span><span><span style="margin-right:8px;font-variant-numeric:tabular-nums">${esc(x.v)}</span><span class="rp-pill ${x.c}">${CNAME[x.c]}</span></span></li>`).join('')}</ul>`) : ''}
    ${obs.length ? sec('Posture & alignment', `<ul class="rp-lst">${obs.map(x => `<li><span>${esc(x[0])}</span><b>${esc(x[1])}</b></li>`).join('')}</ul>`) : ''}</div>`});
  if (S.fit !== 'std' && (num('footAng_L') != null || num('footAng_R') != null))
    B.push({html:sec('Foot angle standing', `<div style="display:flex;gap:22px;align-items:center">${feetSVG('report')}<p class="rp-p" style="flex:1">The line runs along each foot from the heel. Your cleats are rotated to match it, so your feet sit on the pedals the way they stand naturally.<br><br><b>Left:</b> ${esc(footWord(num('footAng_L')))}<br><b>Right:</b> ${esc(footWord(num('footAng_R')))}</p></div>`)});
  const told = [v.goals && v.goals.length ? `<p class="rp-p"><b>Goals:</b> ${esc(v.goals.join(', '))}${v.goalNote ? '. ' + esc(v.goalNote) : ''}</p>` : '',
    pains.length ? `<p class="rp-p"><b>Discomfort:</b> ${pains.map(([k, x]) => `<span class="rp-pill ${x === 2 ? 'r' : 'y'}" style="margin-right:4px">${PAIN[k]}</span>`).join(' ')}</p>` : '',
    v.problems ? `<p class="rp-p">${esc(v.problems)}</p>` : '', v.activities ? `<p class="rp-p"><b>Current weekly activities:</b> ${esc(v.activities)}</p>` : '',
    INJ.some(([k]) => filled(v[k])) ? `<p class="rp-p" style="margin-bottom:4px"><b>Injuries & special notes:</b></p><ul class="rp-lst" style="margin-bottom:10px">${INJ.filter(([k]) => filled(v[k])).map(([k, l]) => `<li><span>${esc(l)}</span><b style="text-align:right">${esc(v[k])}</b></li>`).join('')}</ul>` : ''].join('');
  if (told) B.push({html:sec('What you told us', told)});
  if (v.fitNotes) B.push({html:sec('Fitter’s notes', `<p class="rp-p">${esc(v.fitNotes)}</p>`)});
  const ph = S.fit === 'std' ? [] : S.photos.filter(p => p.inc && p.src);
  if (ph.length){
    const card = (p, big) => `<div class="rp-ph${big ? ' big' : ''}"><div class="im" style="background-image:url('${p._comp || p.src}')"></div><b>${esc(p.tag)}</b>${p.cap ? `<span>${esc(p.cap)}</span>` : ''}</div>`;
    const side = ['Before · side', 'After · side'].map(t => ph.find(p => p.tag === t)).filter(Boolean), rest = ph.filter(p => !side.includes(p));
    if (side.length) B.push({html:sec('Before & after', `<div class="rp-photos">${side.map(p => card(p, true)).join('')}</div>`)});
    for (let i = 0; i < rest.length; i += 2) B.push({html:sec(i === 0 ? 'Fit photos' : '', `<div class="rp-photos">${rest.slice(i, i + 2).map(p => card(p)).join('')}</div>`)});
  }
  // (each line of the plan a card: what's before a dash or colon its name, what's after how much)
  const st = planLines();
  const fu = followUp(), prods = S.products.filter(p => p.n);
  if (st.length) B.push({html:sec('Stretching & strengthening', `<div class="rp-plan">${st.map(x => `<div><b>${esc(x.name)}</b>${x.dose ? `<span>${esc(x.dose)}</span>` : ''}</div>`).join('')}</div>`)});
  if (prods.length) B.push({html:sec('Recommended for you', `<ul class="rp-lst">${prods.map(p => `<li><span>${esc(p.n)}</span><b>${p.p ? '£' + esc(p.p) : ''}</b></li>`).join('')}</ul>`)});
  // (settling in and the follow-up kept together: the report never ends on the follow-up alone)
  B.push({html:sec('Settling in', '<p class="rp-p">Give your body two to three weeks to adapt. Build ride length gradually and note anything that feels different, good or bad. Small aches usually settle; sharp or lasting pain means we should look again.</p>') + `<div class="rp-cta"><div><b>${esc(fu.title)}</b><span>${esc(fu.body)}</span></div><div style="text-align:right;font-size:12.5px;white-space:nowrap">01603 614400<br>precisionfit@pedalrevolution.co.uk</div></div>`});
  return B;
}
const rowsBlock = (b, i, j, cont) => `<div class="rp-sec"><h3 class="rp-h">${b.title}${cont ? '<span class="rp-cont">continued</span>' : ''}</h3>${cont ? '' : b.head.startsWith('<p') ? b.head : ''}${b.head.startsWith('<p') ? '' : b.head}${b.rows.slice(i, j).join('')}${b.foot}${j === b.rows.length ? b.tail || '' : ''}</div>`;
function reportPages(){
  const fit = FITS[S.fit], name = fullName() || 'Client', cap = $('#cap');
  const band = big => `<div class="rp-band${big ? '' : ' sm'}"><img src="${LOGO}" alt=""><div><div class="rp-k">${esc(fit.name)} · ${esc(name)}</div><div class="rp-t">${S.follow ? 'Follow-up Report' : 'Precision Fit Report'}</div></div></div>`;
  const blocks = reportBlocks();
  // measure: each band, each whole block, and for a carried-on block its heading and each row
  const blk = h => `<div class="rp-blk">${h}</div>`;
  cap.innerHTML = `<div class="rp-page" style="min-height:0">${band(true)}${band(false)}<div class="rp-in">${blocks.map(b => b.rows ? blk(rowsBlock({...b, rows:[]}, 0, 0, false)) + blk(rowsBlock(b, 0, b.rows.length, false)) : blk(b.html)).join('')}</div></div>`;
  const bands = $$('.rp-band', cap).map(e => e.offsetHeight), els = $$('.rp-blk', cap);
  let k = 0;
  blocks.forEach(b => {
    // (a block's own space below it, its last part's bottom margin, can fall past the page's end: it's only white)
    if (!b.rows){ const e = els[k++], last = e.lastElementChild; b.h = e.offsetHeight; b.tail = last ? parseFloat(getComputedStyle(last).marginBottom) || 0 : 0; return; }
    b.headH = els[k++].offsetHeight; const whole = els[k++];
    b.rowH = $$(b.foot ? 'tbody > tr' : '.rp-ang', whole).map(e => e.offsetHeight);
  });
  cap.innerHTML = '';
  // pack
  const room = first => PAGE_H - (first ? bands[0] : bands[1]) - TOP_PAD - FOOT_H - SAFE;
  const pages = [[]]; let left = room(true);
  const turn = () => { pages.push([]); left = room(false); };
  const here = () => pages[pages.length - 1];
  for (const b of blocks){
    if (!b.rows){ if (b.h - b.tail > left && here().length) turn(); here().push(b.html); left -= b.h; continue; }
    let i = 0, cont = false;
    while (i < b.rows.length){
      if (left < b.headH + b.rowH[i] && here().length) turn();
      let used = b.headH, j = i;
      while (j < b.rows.length && (used + b.rowH[j] <= left || j === i)){ used += b.rowH[j]; j++; }
      here().push(rowsBlock(b, i, j, cont)); left -= used; i = j; cont = true;
      if (i < b.rows.length) turn();
    }
  }
  const [cL, cR] = cardCols(), card = cL.length || cR.length, n = pages.length + (card ? 1 : 0);
  const out = pages.map((items, i) => `<div class="rp-page">${band(i === 0)}<div class="rp-in">${items.join('')}</div><div class="rp-foot"><span>Pedal Revolution · Precision Fit Studio · 63–67 Bethel Street, Norwich NR2 1NR · 01603 614400</span><span>${i + 1} / ${n}</span></div></div>`);
  if (card){ const [front, back] = cardPages(); out.push(`<div class="rp-page rp-card">${front}<div class="sc-cut"><span>Cut along the line to keep the card with your bike</span></div>${back}</div>`); }
  return out;
}
function gaugeOnly(k){ const h = gaugeHTML(k, ''); const i = h.indexOf('<div class="gauge">'); return i >= 0 ? h.slice(i) : ''; }

async function openReport(){
  for (const p of S.photos) if (p.src && p.marks.length && !p._comp) await composite(p);
  $('#ov-ttl').textContent = `Client report · ${fullName() || 'Client'}`;
  $('#ov-msg').innerHTML = '';
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  $('#pages').innerHTML = reportPages().map(h => `<div class="pg-wrap">${h}</div>`).join('');
  $('#ov').hidden = false; fitPages();
}
function fitPages(){
  const avail = $('#pages').clientWidth;
  $$('#pages .pg-wrap').forEach(w => { const pg = w.firstElementChild, s = Math.min(1, avail / 794);
    pg.style.transform = `scale(${s})`; w.style.width = 794 * s + 'px'; w.style.height = pg.offsetHeight * s + 'px'; });
}

/* ---------------- PDF ---------------- */
function loadScript(src){ return new Promise((res, rej) => { if ([...document.scripts].some(s => s.src === src)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('The PDF tools did not load. Check the connection and try again.')); document.head.appendChild(s); }); }
async function ensureLibs(){
  await loadScript(new URL('vendor/html2canvas.min.js', document.baseURI).href);
  await loadScript(new URL('vendor/jspdf.umd.min.js', document.baseURI).href);
}
async function buildPDF(onStep){
  await ensureLibs();
  for (const p of S.photos) if (p.src && p.marks.length && !p._comp) await composite(p);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const pages = reportPages(), cap = $('#cap'), pdf = new window.jspdf.jsPDF({unit:'pt', format:'a4', compress:true});
  const PW = pdf.internal.pageSize.getWidth(), PH = pdf.internal.pageSize.getHeight();
  let first = true;
  for (let i = 0; i < pages.length; i++){
    onStep && onStep(i + 1, pages.length);
    cap.innerHTML = pages[i];
    const el = cap.firstElementChild;
    const canvas = await window.html2canvas(el, {scale:2, backgroundColor:'#ffffff', useCORS:true, logging:false, windowWidth:900});
    const sliceH = Math.floor(canvas.width * PH / PW);
    for (let y = 0; y < canvas.height - 4; y += sliceH){
      const h = Math.min(sliceH, canvas.height - y), part = document.createElement('canvas'); part.width = canvas.width; part.height = h;
      const pg = part.getContext('2d'); pg.fillStyle = '#fff'; pg.fillRect(0, 0, part.width, h); pg.drawImage(canvas, 0, -y);
      if (!first) pdf.addPage(); first = false;
      pdf.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, PW, h * PW / canvas.width);
    }
  }
  cap.innerHTML = '';
  return pdf.output('blob');
}
let lastPDF = null;
async function savePDF(msgEl){
  const say = (t, cls = '') => { if (msgEl) msgEl.innerHTML = `<div class="msg ${cls}" style="margin-top:8px">${t}</div>`; };
  const btns = $$('[data-act="pdf"]'); btns.forEach(b => b.disabled = true);
  try {
    say('Building the PDF…');
    const blob = await buildPDF((i, n) => say(`Building page ${i} of ${n}…`));
    const fname = `Pedal Revolution Precision Fit - ${fullName() || 'Client'}${val('date') ? ' - ' + val('date') : ''}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
    lastPDF = new File([blob], fname, {type:'application/pdf'});
    let share = false; try { share = !!(navigator.canShare && navigator.canShare({files:[lastPDF]})); } catch(_){}
    say(`<b>${esc(fname)}</b> is ready (${Math.round(blob.size / 1024)} KB).${share ? ' Share it to Mail and it goes as an attachment, with the message already written.' : ''}
      <div class="row-btns" style="margin-top:10px">${share ? '<button type="button" class="btn primary" data-act="share-pdf">Share or email…</button>' : ''}<button type="button" class="btn${share ? '' : ' primary'}" data-act="dl-pdf">Download</button></div>`);
  } catch(e){
    say(esc((e && e.message) || 'The PDF could not be made.'), 'err');
  } finally { btns.forEach(b => b.disabled = false); }
}

/* ---------------- render ---------------- */
function secProgress(sec){
  let tot = 0, got = 0;
  if (!sec || (sec.f && !applies(sec))) return {tot, got};
  if (sec.custom === 'fits') return {tot:1, got:1};
  const cnt = k => { tot++; if (filled(S.v[k])) got++; };
  (sec.angles || []).filter(applies).forEach(a => { cnt(a.k + '_pre'); cnt(a.k + '_post'); });
  (sec.fields || []).filter(applies).forEach(f => {
    if (f.t === 'check'){ f.items.forEach((_, j) => { tot++; if ((S.v[f.k] || [])[j]) got++; }); return; }
    if (f.t === 'light'){ (f.lr ? [f.k + '_L', f.k + '_R'] : [f.k]).forEach(k => { tot++; if (lightOf(k, f.cl)) got++; }); return; }
    if (f.t === 'timer'){ tot++; if (lightOf('plank', 'plank')) got++; return; }
    if (f.t === 'feet'){ ['footSize', 'footLen', 'footWid', 'arch'].forEach(b => ['_L_u', '_L', '_R_u', '_R'].forEach(x => cnt(b + x))); return; }
    if (f.when && !f.when()) return;
    if (f.t === 'feetdraw') return;
    if (f.t === 'injgrid'){ tot++; if (INJ.some(([k]) => filled(S.v[k]))) got++; return; }
    if (f.lr){ cnt(f.k + '_L'); cnt(f.k + '_R'); } else cnt(f.k);
  });
  return {tot, got};
}
function progress(i){
  const id = STEPS[i].id;
  if (id === 'photos'){ const sl = SLOTS[S.fit]; return {tot:sl.length, got:sl.filter(t => S.photos.some(p => p.src && p.tag === t)).length}; }
  if (id === 'report'){ const r = readyItems(); return {tot:r.length, got:r.filter(x => x.ok).length}; }
  if (id === 'bike'){ let tot = 0, got = 0; ALLROWS.filter(r => applies(r) && (S.fit === 'tt' || !TTROWS.includes(r))).forEach(r => [r.k + '_pre', r.k + '_post'].forEach(k => { tot++; if (filled(S.v[k])) got++; })); return {tot, got}; }
  return sectionsFor(id).map(secProgress).reduce((a, b) => ({tot:a.tot + b.tot, got:a.got + b.got}), {tot:0, got:0});
}
function readyItems(){
  const A = anglesList().filter(a => a.post != null).length;
  const bikePost = ALLROWS.filter(r => applies(r) && (S.fit === 'tt' || !TTROWS.includes(r))).filter(r => filled(S.v[r.k + '_post'])).length;
  const sides = ['Before · side','After · side'].filter(t => S.photos.some(p => p.src && p.tag === t)).length;
  const email = (val('email') || '').trim();
  return [
    {ok:!!fullName(), t:'Rider’s name', d:fullName() || 'Add it in Session', step:0},
    {ok:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), t:'Email address', d:email ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : `“${email}” doesn’t look like an email address`) : 'Needed to send the report', step:0},
    {ok:A >= 3, t:'Angles after the fit', d:`${A} recorded${A < 3 ? ', at least 3 needed' : ''}`, step:3},
    {ok:bikePost >= 5, t:'Bike measurements after the fit', d:`${bikePost} recorded${bikePost < 5 ? ', at least 5 needed' : ''}`, step:4},
    ...(S.fit === 'std' || S.follow ? [] : [{ok:sides === 2, t:'Before & after side photos', d:`${sides} of 2 taken`, step:5}]),
    {ok:filled(val('summary')), t:'Overview of changes', d:filled(val('summary')) ? 'Written' : 'Tap “Write it for me” below to draft it', step:6},
  ];
}
function readyHTML(){
  return readyItems().map(x => `<div class="ready-i${x.ok ? ' ok' : ''}"><span class="ic">${x.ok ? ICON_TICK : ''}</span><span class="tx">${esc(x.t)}<small>${esc(x.d)}</small></span>${x.ok || x.step === S.step ? '' : `<button type="button" class="btn sm" data-go="${x.step}">${esc(STEPS[x.step].title)} →</button>`}</div>`).join('');
}
// the steps this fit has (a Standard Fit has no photos), as indexes into STEPS
const visSteps = () => STEPS.map((_, i) => i).filter(i => applies(STEPS[i]));
const stepNo = i => visSteps().indexOf(i) + 1;
function renderRail(){
  let T = 0, G = 0;
  const items = visSteps().map(i => { const s = STEPS[i], p = progress(i); T += p.tot; G += p.got; const done = p.tot && p.got === p.tot;
    const sfx = s.id === 'photos' ? ' photos' : s.id === 'report' ? ' ready' : '';
    return `<button type="button" class="step-btn${done ? ' done' : ''}" data-go="${i}"${i === S.step ? ' aria-current="step"' : ''}><span class="n">${done && i !== S.step ? '✓' : stepNo(i)}</span><span class="t">${s.title}</span><span class="p">${p.got} of ${p.tot}${sfx}</span></button>`; }).join('');
  const pct = T ? Math.round(G / T * 100) : 0;
  const A = anglesList().filter(a => a.r && a.post != null), inR = A.filter(a => a.post >= a.r[0] && a.post <= a.r[1]).length, L = lights(), reds = L.filter(x => x.c === 'r').length;
  $('#rail').innerHTML = items + `<div class="rail-fit"><b>${FITS[S.fit].name}</b>${FITS[S.fit].price} · ${FITS[S.fit].time}${val('fitter') ? ' · ' + esc(val('fitter')) : ''}
    <div class="snap"><div><b>${A.length ? inR + '/' + A.length : '–'}</b><span>angles in range</span></div><div><b>${changes().length}</b><span>set-up changes</span></div><div><b class="${reds ? 'r' : ''}">${reds}</b><span>red flags</span></div></div>
    <div class="pbar"><i style="width:${pct}%"></i></div><div style="margin-top:6px;font-size:12.5px;color:var(--mute)">${pct}% of the fit recorded</div></div>`;
  const pg = $('#pg-prog'); if (pg) pg.style.width = pct + '%';
}
function renderHeader(){
  $('#hd-name').textContent = fullName() || 'New fit';
  $('#hd-sub').textContent = [FITS[S.fit].name, val('bike'), val('date') ? new Date(val('date') + 'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short'}) : ''].filter(Boolean).join(' · ');
  const vis = visSteps(), at = vis.indexOf(S.step);
  $('#pg-back').disabled = at === 0;
  $('#pg-mid').textContent = `Step ${at + 1} of ${vis.length} · ${STEPS[S.step].title}`;
  const last = at === vis.length - 1;
  $('#pg-next').textContent = last ? 'Preview report' : `${STEPS[vis[at + 1]].title} →`;
  $('#pg-next').dataset.act = last ? 'preview' : 'next';
}
function jumpHTML(id){
  const secs = sectionsFor(id).map((s, i) => ({s, i})).filter(x => x.s.title && !(x.s.f && !applies(x.s)));
  if (secs.length < 3) return '';
  return `<nav class="jump" aria-label="Jump to a section">${secs.map(({s, i}) => { const p = secProgress(s);
    return `<button type="button" data-jump="${i}">${esc(s.title)}${p.tot && s.custom !== 'fits' ? `<span class="c${p.got === p.tot ? ' ok' : ''}" data-x="jumpcount" data-i="${i}">${p.got}/${p.tot}</span>` : ''}</button>`; }).join('')}</nav>`;
}
function secHTML(sec, i){
  if (sec.f && !applies(sec)) return '';
  if (sec.custom === 'fits') return fitsHTML();
  if (sec.custom === 'bike') return bikeHTML();
  if (sec.custom === 'photos') return photosHTML();
  if (sec.custom === 'report') return reportStepHTML();
  const p = secProgress(sec), ok = p.tot && p.got === p.tot;
  const tag = sec.f ? `<span class="tag-fit">${sec.f === 'T' ? 'TT & Tri' : 'Full & TT fits'}</span>` : sec.note ? `<span class="sec-note">${esc(sec.note)}</span>` : '';
  const count = p.tot ? `<span class="sec-count${ok ? ' ok' : ''}" data-x="seccount" data-i="${i}">${ok ? '✓ ' : ''}${p.got} of ${p.tot}</span>` : '';
  return `<section class="sec" id="sec-${i}"><div class="sec-h"><h2>${esc(sec.title)}</h2><div class="right">${tag}${count}</div></div>
    ${sec.custom === 'body' ? bodyHTML() + '<div style="height:18px"></div>' : ''}${sec.custom === 'start' ? startHTML() : ''}
    ${sec.angles ? `<div class="angles">${sec.angles.map(angleHTML).join('')}</div>${sec.fields ? '<div style="height:18px"></div>' : ''}` : ''}
    ${sec.fields && !sec.ownFields ? `<div class="grid">${sec.fields.map(fieldHTML).join('')}</div>` : ''}</section>`;
}
function renderMain(){
  if (!applies(STEPS[S.step])) S.step = visSteps().filter(i => i < S.step).pop() ?? 0;
  const st = STEPS[S.step];
  $('#main').innerHTML = `<div class="step-head"><div class="eyebrow">Step ${stepNo(S.step)} · ${S.follow ? 'Follow-up · ' : ''}${FITS[S.fit].name}</div><h1>${st.title}</h1><p class="lede">${st.lede}</p></div>
    ${S.follow ? `<div class="fu-note"><b>Follow-up to the fit on ${esc(dayTxt(S.follow.date, {day:'numeric', month:'long', year:'numeric'}) || 'an earlier date')}.</b> Before values are where that fit left the bike and the rider; record today’s as After.</div>` : ''}
    ${jumpHTML(st.id)}${sectionsFor(st.id).map(secHTML).join('')}
`;
  refresh(); renderRail(); renderHeader();
  const rail = $('#rail'), cur = $('#rail [aria-current]');
  if (cur && getComputedStyle(rail).flexDirection === 'row') rail.scrollLeft += cur.getBoundingClientRect().left - rail.getBoundingClientRect().left - rail.clientWidth / 2 + cur.clientWidth / 2;
  if (st.id === 'photos') wireDrop();
}
function refresh(){
  $$('[data-when]').forEach(el => { const f = WHEN[el.dataset.when]; if (f) el.hidden = !f(); });
  $$('[data-x]').forEach(el => {
    const k = el.dataset.k;
    switch (el.dataset.x){
    case 'tl': { const c = lightOf(k, el.dataset.cl); $$('button', el).forEach(b => b.setAttribute('aria-pressed', b.dataset.c === c)); break; }
    case 'gauge': el.innerHTML = gaugeHTML(k, el.dataset.u); break;
    case 'delta': { const r = ALLROWS.find(x => x.k === k), d = deltaOf(r); el.textContent = d.txt; el.classList.toggle('ch', d.ch); break; }
    case 'inseam': { const n = num('inseam'), less = S.fit === 'tt' ? 9 : 10;   // (the triathlon form: inseam − 9 cm)
      el.innerHTML = n != null ? `<span>Starting saddle height</span><b>${fmt(n - less)} cm</b><span class="hint">inseam − ${less} cm</span>` : `<span class="hint">Starting saddle height appears here: inseam − ${less} cm</span>`; break; }
    case 'painlist': el.innerHTML = painListHTML(); break;
    case 'feetdraw': if (!FOOTDRAG) el.innerHTML = feetSVG('rider'); break;
    case 'ttscore': el.innerHTML = ttScoreHTML(); break;
    case 'uci': el.innerHTML = uciHTML(); break;
    case 'seccount': case 'jumpcount': { const sec = sectionsFor(STEPS[S.step].id)[+el.dataset.i]; const p = secProgress(sec), ok = p.got === p.tot;
      el.classList.toggle('ok', ok); el.textContent = el.dataset.x === 'seccount' ? `${ok ? '✓ ' : ''}${p.got} of ${p.tot}` : `${p.got}/${p.tot}`; break; }
    case 'ready': el.innerHTML = readyHTML(); break;
    case 'readycount': { const r = readyItems(), n = r.filter(x => x.ok).length; el.textContent = `${n === r.length ? '✓ ' : ''}${n} of ${r.length} done`; el.classList.toggle('ok', n === r.length); break; }
    }
  });
  const m = $('#mail'); if (m) m.textContent = mailText();
  const ml = $('#mailto'); if (ml) ml.href = mailtoHref();
}
function go(i){
  // (Back and Next step over a step this fit doesn't have)
  const dir = i < S.step ? -1 : 1;
  while (i >= 0 && i < STEPS.length && !applies(STEPS[i])) i += dir;
  S.step = Math.max(0, Math.min(STEPS.length - 1, i)); save(); renderMain(); window.scrollTo(0, 0);
}

/* ---------------- events ---------------- */
let timer = null;
function fmtClock(ms){ const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function toggleTimer(){
  const btn = $('#tm-go');
  if (timer){ clearInterval(timer.iv); S.v.plank = Math.round((Date.now() - timer.t0) / 1000); delete S.v.plank_c; timer = null; save(); renderMain(); return; }
  timer = {t0:Date.now()}; btn.textContent = 'Stop'; btn.classList.replace('dark', 'primary');
  timer.iv = setInterval(() => { const c = $('#clock'); if (!c){ clearInterval(timer.iv); timer = null; return; } const ms = Date.now() - timer.t0; c.textContent = fmtClock(ms); if (ms >= 90000){ toggleTimer(); } }, 200);
}
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-bm]'); if (!t) return;
  const d = t.dataset;
  if (d.go !== undefined) return go(+d.go);
  if (d.jump !== undefined){ const el = document.getElementById('sec-' + d.jump); if (el) el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'}); return; }
  if (d.fit){ S.fit = d.fit; save(); renderMain(); return; }
  if (d.seg){ const k = d.seg;
    if (d.multi !== undefined){ const a = new Set(S.v[k] || []); a.has(d.val) ? a.delete(d.val) : a.add(d.val); S.v[k] = [...a]; t.setAttribute('aria-pressed', a.has(d.val)); }
    else { S.v[k] = S.v[k] === d.val ? '' : d.val; $$(`[data-seg="${k}"]`).forEach(b => b.setAttribute('aria-pressed', b.dataset.val === S.v[k])); }
    save(); refresh(); renderRail(); return; }
  if (d.tlset){ const k = d.tlset; const cur = lightOf(k, ''+$(`[data-x="tl"][data-k="${k}"]`).dataset.cl);
    if (cur === d.c){ delete S.v[k + '_c']; S.v[k] = ''; } else { S.v[k + '_c'] = d.c; S.v[k] = ''; }
    const inp = $('#i-' + k); if (inp) inp.value = ''; save(); refresh(); renderRail(); return; }
  if (d.bio){ S.v.bio = S.v.bio === d.bio ? '' : d.bio; $$('[data-bio]').forEach(b => b.setAttribute('aria-pressed', b.dataset.bio === S.v.bio)); save(); refresh(); renderRail(); return; }
  if (d.chk){ const a = S.v[d.chk] = (S.v[d.chk] || []).slice(); a[+d.i] = !a[+d.i]; t.setAttribute('aria-pressed', !!a[+d.i]); save(); refresh(); renderRail(); return; }
  if (d.bm){ const k = d.bm; S.pain[k] = ((S.pain[k] || 0) + 1) % 3; if (!S.pain[k]) delete S.pain[k]; $$(`.bm-r[data-bm="${k}"]`).forEach(r => r.dataset.s = S.pain[k] || 0); save(); refresh(); return; }
  if (d.stepk){ const k = d.stepk, by = +d.by * +d.dir, cur = isNum(S.v[k]) ? S.v[k] : (isNum(S.v[k.replace('_post', '_pre')]) && k.endsWith('_post') ? S.v[k.replace('_post', '_pre')] : 0);
    S.v[k] = Math.round((cur + by) * 10) / 10; const inp = $('#i-' + k); if (inp) inp.value = S.v[k]; save(); refresh(); renderRail(); return; }
  switch (d.act){
  case 'next': return go(S.step + 1);
  case 'back': return go(S.step - 1);
  case 'preview': return openReport();
  case 'close-ov': $('#ov').hidden = true; return;
  case 'pdf': return savePDF(t.closest('#ov') ? $('#ov-msg') : $('#send-msg'));
  case 'timer': return toggleTimer();
  case 'stretch-draft': {
    const ta = $('#i-stretchText'), m = $('#stretch-msg'), txt = draftStretches();
    if (!txt){ if (m) m.innerHTML = '<div class="msg" style="margin-top:10px">Nothing in the assessment calls for one yet. Type the plan, or fill in the off-bike assessment first.</div>'; return; }
    // (what's typed already stays: the suggestions not in it go below)
    const have = (ta.value || '').trim(), add = txt.split('\n').filter(l => !have.toLowerCase().includes(l.split(' — ')[0].toLowerCase()));
    S.v.stretchText = [have, ...add].filter(Boolean).join('\n'); ta.value = S.v.stretchText; save();
    if (m) m.innerHTML = add.length ? '' : '<div class="msg" style="margin-top:10px">Everything the assessment suggests is already in the plan.</div>';
    return; }
  case 'draft': { const s = draftSummary(); S.v.summary = s || 'Add before and after measurements first, then tap again.'; $('#i-summary').value = S.v.summary; save(); renderRail(); return; }
  case 'prod-add': S.products.push({n:'', p:''}); save(); renderMain(); setTimeout(() => { const i = $('#pn-' + (S.products.length - 1)); i && i.focus(); }); return;
  case 'prod-del': S.products.splice(+d.i, 1); save(); renderMain(); return;
  case 'copy-mail': { const txt = mailText(), msg = $('#send-msg');
    const ok = () => msg.innerHTML = '<div class="msg ok" style="margin-top:8px">Email copied. Paste it into Mail and attach the PDF.</div>';
    try { navigator.clipboard.writeText(txt).then(ok, () => { selectMail(); msg.innerHTML = '<div class="msg" style="margin-top:8px">Copy was blocked here. The message is selected: use Copy from the menu.</div>'; }); } catch(_){ selectMail(); }
    return; }
  case 'measure': return openMeasure(d.ph);
  case 'inc': { const p = S.photos.find(x => x.id === d.ph); p.inc = !p.inc; save(); renderMain(); return; }
  case 'del': { if (t.dataset.arm !== '1'){ t.dataset.arm = '1'; t.textContent = 'Tap to remove'; setTimeout(() => { if (t.isConnected){ t.dataset.arm = ''; t.textContent = 'Remove'; } }, 3000); return; }
    S.photos = S.photos.filter(x => x.id !== d.ph); save(); renderMain(); return; }
  case 'mz-new': { const p = MZ && MZ.p; if (!p) return; p.marks = p.marks.filter(m => m.p.length === 3); drawMZ(); return; }
  case 'mz-undo': { const p = MZ && MZ.p; if (!p) return; const last = p.marks[p.marks.length - 1]; if (last){ last.p.pop(); if (!last.p.length) p.marks.pop(); } drawMZ(); return; }
  case 'mz-done': return closeMZ();
  case 'compare': return openCompare();
  case 'cmp-close': $('#cmp').hidden = true; CMP = null; return;
  case 'copy-same': { let n = 0;
    ALLROWS.filter(r => applies(r) && (S.fit === 'tt' || !TTROWS.includes(r))).forEach(r => { if (filled(S.v[r.k + '_pre']) && !filled(S.v[r.k + '_post'])){ S.v[r.k + '_post'] = S.v[r.k + '_pre']; n++; } });
    save(); renderMain(); const m = $('#copy-msg');
    if (m) m.innerHTML = `<div class="msg${n ? ' ok' : ''}" style="margin-bottom:12px">${n ? `Copied ${n} unchanged value${n > 1 ? 's' : ''} to After. Edit any that did change.` : 'Every After value with a Before value is already filled in.'}</div>`; return; }
  case 'new': return newFit();
  case 'fits': return openFits();
  case 'fits-close': $('#fits').hidden = true; return;
  case 'signout': {
    t.disabled = true;
    (async () => { if (saveT) await writeNow(); try { await fetch('api/logout', {method:'POST', credentials:'same-origin'}); } catch(_){} location.replace('login'); })();
    return; }
  case 'fit-open': { const f = FITLIST.find(x => x.id === d.id); if (f) openFit(f); return; }
  case 'fit-follow': { const f = FITLIST.find(x => x.id === d.id); if (f) startFollowUp(f); return; }
  case 'fit-del': {
    if (t.dataset.arm !== '1'){ t.dataset.arm = '1'; t.textContent = 'Tap to delete'; t.classList.replace('ghost', 'primary'); setTimeout(() => { if (t.isConnected){ t.dataset.arm = ''; t.textContent = 'Delete'; t.classList.replace('primary', 'ghost'); } }, 3000); return; }
    dbDel(d.id).catch(() => {}).then(async () => { FITLIST = FITLIST.filter(x => x.id !== d.id); if (S.id === d.id){ S = blank(); S.fit = 'std'; await writeNow(); renderMain(); } renderFits(); }); return; }
  case 'share-pdf': {
    if (!lastPDF) return;
    navigator.share({files:[lastPDF], title:lastPDF.name, text:mailText().replace(/^Subject: .*\n\n/, '')}).catch(e => { if (e && e.name !== 'AbortError'){ const m = t.closest('.msg'); if (m) m.insertAdjacentHTML('beforeend', '<div style="margin-top:8px">Sharing didn’t open. Use Download, then attach the file.</div>'); } });
    return; }
  case 'dl-pdf': {
    if (!lastPDF) return;
    const u = URL.createObjectURL(lastPDF), a = document.createElement('a'); a.href = u; a.download = lastPDF.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
    return; }
  }
});
function selectMail(){ const r = document.createRange(); r.selectNodeContents($('#mail')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
document.addEventListener('input', e => {
  const t = e.target, d = t.dataset;
  if (d.k){
    let v = t.value;
    if (d.num !== undefined){ const n = parseFloat(v.replace(',', '.').replace('−', '-')); v = v.trim() === '' || isNaN(n) ? '' : n; delete S.v[d.k + '_c']; }
    S.v[d.k] = v;
    if (d.k === 'email'){ $$('[data-k="email"]').forEach(x => { if (x !== t) x.value = t.value; }); }
    save(); refresh(); renderRail(); renderHeader(); return;
  }
  if (d.pk){ const p = S.photos.find(x => x.id === d.pk); if (p){ p[d.f] = t.value; save(); } return; }
  if (d.prod !== undefined){ S.products[+d.prod][d.f] = t.value; save(); return; }
});
document.addEventListener('change', e => { const t = e.target; if (t.type === 'file' && t.files && t.files.length){ addFiles([...t.files], t.dataset.slot); t.value = ''; } });
function wireDrop(){
  const z = $('#drop'); if (!z) return;
  ['dragenter','dragover'].forEach(n => z.addEventListener(n, e => { e.preventDefault(); z.classList.add('over'); }));
  ['dragleave','drop'].forEach(n => z.addEventListener(n, () => z.classList.remove('over')));
  z.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
}
const mzc = $('#mz-c');
mzc.addEventListener('pointerdown', mzDown); mzc.addEventListener('pointermove', mzMove); mzc.addEventListener('pointerup', mzUp); mzc.addEventListener('pointercancel', mzUp);
let CMP = null;
function openCompare(){
  const a = S.photos.find(p => p.src && p.tag === 'Before · side'), b = S.photos.find(p => p.src && p.tag === 'After · side');
  if (!a || !b) return;
  $('#cmp-a').src = a._comp || a.src; $('#cmp-b').src = b._comp || b.src;
  $('#cmp-ttl').textContent = `Before & after · ${fullName() || 'Rider'}`;
  CMP = {w:a.w || b.w || 3, h:a.h || b.h || 2, x:0.5, drag:false};
  $('#cmp').hidden = false; layoutCmp();
}
function layoutCmp(){
  const st = $('#cmp-stage'), box = $('#cmp-box');
  const s = Math.min((st.clientWidth - 24) / CMP.w, (st.clientHeight - 24) / CMP.h);
  box.style.width = CMP.w * s + 'px'; box.style.height = CMP.h * s + 'px'; setCmp(CMP.x);
}
function setCmp(x){ CMP.x = Math.max(0, Math.min(1, x)); $('#cmp-b').style.clipPath = `inset(0 0 0 ${(CMP.x * 100).toFixed(2)}%)`; $('#cmp-h').style.left = (CMP.x * 100).toFixed(2) + '%'; }
const cmpBox = $('#cmp-box');
const cmpAt = e => { const r = cmpBox.getBoundingClientRect(); setCmp((e.clientX - r.left) / r.width); };
cmpBox.addEventListener('pointerdown', e => { if (!CMP) return; e.preventDefault(); CMP.drag = true; cmpBox.setPointerCapture(e.pointerId); cmpAt(e); });
cmpBox.addEventListener('pointermove', e => { if (CMP && CMP.drag) cmpAt(e); });
['pointerup','pointercancel'].forEach(n => cmpBox.addEventListener(n, () => { if (CMP) CMP.drag = false; }));

window.addEventListener('resize', () => { if (!$('#ov').hidden) fitPages(); if (MZ) layoutMZ(); if (CMP) layoutCmp(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ if (!$('#fits').hidden) $('#fits').hidden = true; else if (CMP){ $('#cmp').hidden = true; CMP = null; } else if (MZ) closeMZ(); else if (!$('#ov').hidden) $('#ov').hidden = true; } });

document.addEventListener('input', e => { if (e.target.id === 'fits-q') renderFits(); });

/* ---------------- start ---------------- */
(async () => {
  // (signed in? Not: the sign-in page. No answer at all, offline in the studio: carry on with what's on this device)
  try {
    const r = await fetch('api/me', {credentials:'same-origin', cache:'no-store'});
    if (r.status === 401){ location.replace('login'); return; }
    if (r.ok) ME = (await r.json()).name || '';
  } catch(_){}
  $('#who-me').textContent = ME ? `Signed in as ${ME}` : '';
  S = await load();
  renderMain();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  try { if (document.fonts) await Promise.race([document.fonts.load("italic 800 46px 'Barlow Condensed'"), new Promise(r => setTimeout(r, 2500))]); } catch(_){}
  await markPhotos();
})();
