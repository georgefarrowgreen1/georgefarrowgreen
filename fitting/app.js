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

const BIKE = [
  {g:'Saddle', k:'sadModel', label:'Saddle make & model', t:'text'},
  {g:'Saddle', k:'sadW', label:'Saddle width', u:'mm', step:5},
  {g:'Saddle', k:'sadH', label:'Saddle height', u:'mm', hint:'BB centre to saddle top'},
  {g:'Saddle', k:'setback', label:'Saddle setback', u:'mm', hint:'Saddle tip behind BB'},
  {g:'Saddle', k:'tilt', label:'Saddle tilt', u:'°', step:0.5},
  {g:'Saddle', k:'postOff', label:'Seat post offset', u:'mm', step:5, f:'FT'},
  {g:'Drivetrain', k:'crank', label:'Crank length', u:'mm', step:2.5, f:'FT'},
  {g:'Cockpit', k:'barModel', label:'Handlebar model', t:'text', f:'FT'},
  {g:'Cockpit', k:'barW', label:'Handlebar width', u:'mm', step:20},
  {g:'Cockpit', k:'stemL', label:'Stem length', u:'mm', step:10},
  {g:'Cockpit', k:'stemA', label:'Stem angle', u:'°'},
  {g:'Cockpit', k:'spacers', label:'Headset spacers', u:'mm', step:5, hint:'Front height'},
  {g:'Reach & drop', k:'barReach', label:'Saddle to bar reach', u:'mm', step:5, f:'FT'},
  {g:'Reach & drop', k:'hoods', label:'Saddle to hoods reach', u:'mm', step:5, f:'FT'},
  {g:'Reach & drop', k:'tipBar', label:'Saddle tip to bar', u:'mm', step:5, f:'FT'},
  {g:'Reach & drop', k:'drop', label:'Saddle to bar drop', u:'mm', step:5, f:'FT'},
  {g:'Coordinates', k:'hx', label:'Handlebar X', u:'mm', step:5, f:'FT'}, {g:'Coordinates', k:'hy', label:'Handlebar Y', u:'mm', step:5, f:'FT'},
  {g:'Coordinates', k:'sx', label:'Saddle X', u:'mm', step:5, f:'FT'}, {g:'Coordinates', k:'sy', label:'Saddle Y', u:'mm', step:5, f:'FT'},
];
const TTROWS = [
  {k:'padStack', label:'Pad stack', u:'mm', step:5, hint:'BB to top of armrest pad'},
  {k:'padReach', label:'Pad reach', u:'mm', step:5, hint:'BB to back of pad'},
  {k:'padW', label:'Pad width', u:'mm', step:5, hint:'Centre to centre'},
  {k:'extLen', label:'Extension length', u:'mm', step:10},
  {k:'extA', label:'Extension angle', u:'°', step:1},
  {k:'nose', label:'Saddle nose behind BB', u:'mm', step:5},
  {k:'extFront', label:'Extension tip ahead of BB', u:'mm', step:5},
];
const ALLROWS = [...BIKE, ...TTROWS];

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
    {title:'Rider', fields:[T('first','First name'), T('last','Last name'), T('email','Email',{type:'email', ph:'For sending the report'}), T('phone','Phone',{type:'tel'})]},
    {title:'Bike', fields:[T('bike','Brand & model',{ph:'e.g. Trek Domane SL 6'}), T('frame','Frame size',{ph:'e.g. 56 cm'}),
      SG('bikeType','Bike type',['Road','Gravel','TT / Tri','Other']), T('pedals','Pedals & cleat float'), T('shoes','Shoe brand & size')]},
  ];
  case 'interview': return [
    {title:'About the rider', fields:[SG('sex','Sex',['Male','Female'],{hint:'Sets the side of the saddle sizer'}), SG('style','Riding style',['Recreational','Serious recreational','Racer','Triathlete'],{wide:true}),
      N('age','Age','yrs'), N('height','Height','cm'), N('weight','Weight','kg'), T('job','Occupation')]},
    {title:'Riding', fields:[N('rideTime','Average ride','hrs'), N('speed','Average speed','mph'), N('cadence','Cadence','rpm'), N('years','Years cycling','yrs'),
      N('daysS','Days a week (summer)','days'), N('daysW','Days a week (winter)','days'),
      CH('miles','Where the miles come from',['Club rides','Sportives','Solo','Commuting','Racing','Indoor / Zwift','Triathlon'],{wide:true})]},
    {title:'Goals for today', fields:[CH('goals','Goals',['Comfort','Longer rides','Performance','Fix pain or discomfort','New bike set-up','Aero speed','Event prep'],{wide:true}), TA('goalNote','In their words')]},
    {title:'On-bike problems', custom:'body', fields:[TA('problems','Describe the problems',{ph:'When it starts, which side, what helps'})]},
    {title:'Health & activity', fields:[TA('activities','Current physical activities (weekly or more)'), TA('injuries','Injuries & special notes',{ph:'Broken bones, surgeries, chronic issues'}),
      SG('treated','Treated by a medical professional or therapist?',['No','Yes'],{f:'FT', wide:true})]},
  ];
  case 'offbike': return [
    {title:'Feet', fields:[SG('arch','Arch height (weighted)',['Low','Medium','High'],{lr:true, f:'FT'}), SG('footbed','Footbed',['Stock','Trimmed','Custom']),
      N('footLen','Foot length','mm',{lr:true, f:'FT'}), N('footWid','Foot width','mm',{lr:true, f:'FT'}), N('footAng','Foot angle standing','°',{lr:true, f:'FT'}),
      {t:'bio', k:'bio', label:'BioDynamic 3D arch profile', f:'FT'}, T('insole','Innersole size',{f:'FT'})]},
    {title:'Knees', f:'FT', fields:[SG('knee','Alignment standing',['Bends in','Neutral','Bows out'],{lr:true, wide:true})]},
    {title:'Hips & pelvis', fields:[SG('pelvis','Pelvis height',['Left higher','Level','Right higher'],{f:'FT'}), SG('legLen','Leg length',['Equal','Left shorter','Right shorter'],{f:'FT'}),
      N('legLenMm','Difference','mm',{f:'FT'}), {t:'ischial', k:'ischial', label:'Ischial (sit-bone) width'}, LT('backFlex','Lower back flexibility','°','back')]},
    {title:'Posture & shoulders', fields:[SG('shFwd','Shoulders drawn forward?',['Yes','No'],{f:'FT'}), SG('shLevel','Shoulders level?',['Left higher','Level','Right higher'],{f:'FT'}),
      N('shWidth','Shoulder width','cm'), SG('elbows','At 90°, elbows touching?',['Yes','No'],{f:'FT'})]},
    {title:'Body dimensions', fields:[{t:'inseam', k:'inseam', label:'Inseam (no shoes)'}, N('thigh','Thigh diameter','cm',{f:'FT'})]},
    {title:'Stability', f:'FT', note:'Plank test, up to 90 seconds', fields:[{t:'timer', k:'plank', label:'Plank hold', wide:true}]},
    {title:'Range of motion', f:'FT', fields:[LT('ham','Hamstring flexibility','°','ham',{lr:true}), LT('hipR','Hip restriction','°','hip',{lr:true})]},
  ];
  case 'onbike': return [
    // (the body measurements here are the off-bike assessment's own: the same fields, so they count once a fit)
    {title:'Starting position', custom:'start', ownFields:true, note:'From the rider’s body measurements',
      fields:[N('height','Height','cm'), N('inseam','Inseam','cm'), N('ischial','Sit-bone width','mm'), N('shWidth','Shoulder width','cm'), N('footAng','Foot angle','°',{lr:true, f:'FT'}),
        CK('startChk',['Saddle set level','Shifters level with the tops of the bar'])]},
    {title:'Shoe set-up', fields:[CK('shoeSet',['Cleats at least 1 cm behind M1','Cleat rotation matches the off-bike foot assessment','Cleat rotation checked with the rider on the bike','Stance width adjusted for the rider'])]},
    {title:'Lower body', angles:[AN('legExt','Leg extension','°'), AN('hipTop','Hip angle, top of stroke','°'), AN('sacral','Sacral angle','°',{f:'FT'}), AN('kops','Knee over pedal spindle','cm'), AN('bmr','Body mass representation','cm')],
      fields:[SG('heel','Heel lift & pedal technique',['Even','Heel drops','Toes down']), SG('kneeTrack','Knee tracking',['Tracks in','Straight','Tracks out'],{lr:true, f:'FT'}),
        SG('latFoot','Lateral foot alignment',['Aligned','Wedge added','Spacer added'],{f:'FT'})]},
    {title:'Upper body', angles:[AN('torso','Torso angle','°'), AN('shoulder','Shoulder angle','°'), AN('elbow','Elbow angle','°')]},
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
const blank = () => ({id:newId(), created:Date.now(), fit:'full', step:0, v:{date:new Date().toISOString().slice(0,10), fitter:'Kate'}, pain:{}, photos:[], products:[], stretches:null, sample:false});

function sampleState(){
  const s = blank();
  s.id = 'sample'; s.sample = true; s.fit = 'full';
  Object.assign(s.v, {
    fitter:'Kate', first:'Jordan', last:'Hale', email:'jordan.hale@example.com', phone:'07700 900123',
    bike:'Trek Domane SL 6', frame:'56 cm', bikeType:'Road', pedals:'Shimano SPD-SL, yellow cleats (6°)', shoes:'Specialized Torch, EU 43',
    sex:'Male', style:'Serious recreational', age:46, height:178, weight:78, job:'Architect, desk-based',
    rideTime:2.5, speed:17, cadence:84, years:6, daysS:3, daysW:2, miles:['Club rides','Sportives','Indoor / Zwift'],
    goals:['Comfort','Longer rides','Fix pain or discomfort'], goalNote:'Wants to ride the 100-mile Norfolk sportive in June without his back seizing up.',
    problems:'Lower back aches after about 2 hours. Right knee niggles on long climbs. Left hand goes numb after an hour on the hoods.',
    activities:'Yoga once a week. Five-a-side football on Tuesdays.', injuries:'Right ACL reconstruction in 2014, fully rehabilitated. Tight hips from desk work.', treated:'Yes',
    arch_L:'Medium', arch_R:'Low', footbed:'Stock', footLen_L:271, footLen_R:274, footWid_L:102, footWid_R:104, footAng_L:8, footAng_R:12, bio:'y', insole:'EU 42–43',
    knee_L:'Neutral', knee_R:'Bends in', pelvis:'Right higher', legLen:'Equal', ischial:128, backFlex:42, shFwd:'Yes', shLevel:'Level', shWidth:41, elbows:'No',
    inseam:84, thigh:56, plank:55, ham_L:62, ham_R:48, hipR_L:72, hipR_R:84,
    startChk:[true,true], shoeSet:[true,true,true,true],
    legExt_pre:136, legExt_post:141, hipTop_pre:41, hipTop_post:48, sacral_pre:62, sacral_post:65, kops_pre:1.8, kops_post:0.4, bmr_pre:3.2, bmr_post:1.6,
    torso_pre:38, torso_post:42, shoulder_pre:96, shoulder_post:89, elbow_pre:151, elbow_post:159,
    heel:'Heel drops', kneeTrack_L:'Straight', kneeTrack_R:'Tracks in', latFoot:'Wedge added',
    fitNotes:'Right knee tracks in under load. One varus wedge under the right cleat straightened it on the camera.',
    sadModel_pre:'Bontrager Montrose Comp 138', sadModel_post:'Bontrager Verse Pro 145', sadW_pre:138, sadW_post:145, sadH_pre:718, sadH_post:734,
    setback_pre:62, setback_post:55, tilt_pre:-1.5, tilt_post:0, crank_pre:172.5, crank_post:170, barW_pre:420, barW_post:400,
    stemL_pre:110, stemL_post:100, stemA_pre:-7, stemA_post:7, spacers_pre:15, spacers_post:25, barReach_pre:470, barReach_post:448, hoods_pre:545, hoods_post:520, drop_pre:85, drop_post:67,
    tipBar_pre:520, tipBar_post:497, barModel_pre:'Bontrager Elite VR-CF 42', barModel_post:'Bontrager Elite VR-CF 40',
    cleatL:'1.2 cm behind M1, neutral rotation', cleatR:'1.2 cm behind M1, 2° heel in, one varus wedge',
    summary:''
  });
  s.pain = {lowback:2, knee_R:1, hand_L:1, neck:1};
  s.products = [{n:'BioDynamic custom insoles', p:'49.99'}, {n:'Cleat wedges, pair', p:'14.99'}];
  s.photos = [{id:'smp1', sample:'before', tag:'Before · side', cap:'Saddle low, long reach: knee extension short of range', marks:[], inc:true},
              {id:'smp2', sample:'after', tag:'After · side', cap:'Saddle up 16 mm, front raised: knee inside range, torso more open', marks:[], inc:true}];
  return s;
}

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
async function load(){
  const id = lsGet(CUR);
  if (id){ try { const r = await dbGet(id); if (r && r.v) return Object.assign(blank(), r); } catch(_){} }
  return sampleState();
}
const record = () => ({...S, updated:Date.now(), photos:S.photos.map(p => { const {_comp, ...rest} = p; return p.sample ? {...rest, src:undefined} : rest; })});
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
  await ensureSamplePhotos(); renderMain();
}
async function newFit(){
  if (saveT) await writeNow();
  S = blank(); S.fit = 'std'; await writeNow();
  $('#fits').hidden = true; renderMain(); window.scrollTo(0, 0);
}

/* the fits on this device */
let FITLIST = [];
async function openFits(){
  if (saveT) await writeNow();
  try { FITLIST = (await dbAll()).sort((a, b) => (b.updated || 0) - (a.updated || 0)); } catch(_){ FITLIST = []; }
  if (!FITLIST.some(f => f.id === 'sample')) FITLIST.push({id:'sample', v:{first:'Jordan', last:'Hale', date:'', bike:'Trek Domane SL 6'}, fit:'full', sample:true});
  $('#fits-q').value = ''; renderFits(); $('#fits').hidden = false;
}
function renderFits(){
  const q = $('#fits-q').value.trim().toLowerCase();
  const rows = FITLIST.filter(f => !q || [f.v.first, f.v.last, f.v.bike, f.v.email].join(' ').toLowerCase().includes(q));
  $('#fitlist').innerHTML = rows.length ? rows.map(f => {
    const name = [f.v.first, f.v.last].filter(Boolean).join(' ') || 'Rider not named yet';
    const when = f.v.date ? new Date(f.v.date + 'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) : '';
    const open = S && f.id === S.id;
    return `<div class="fit-row${open ? ' open' : ''}"><div class="fr-main"><b>${esc(name)}${f.sample ? ' <span class="pill n">Sample</span>' : ''}</b>
      <span>${esc([FITS[f.fit] ? FITS[f.fit].name : '', f.v.bike, when].filter(Boolean).join(' · '))}</span></div>
      ${open ? '<span class="pill g">Open</span>' : `<button type="button" class="btn sm dark" data-act="fit-open" data-id="${esc(f.id)}">Open</button>`}
      ${f.sample ? '' : `<button type="button" class="btn sm ghost" data-act="fit-del" data-id="${esc(f.id)}">Delete</button>`}</div>`;
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
function fieldHTML(f){
  if (!applies(f)) return '';
  const wide = f.wide ? ' wide' : '';
  const lab = `<span class="lab">${esc(f.label)}${f.hint ? ` <small>· ${esc(f.hint)}</small>` : ''}</span>`;
  switch (f.t){
  case 'text': {
    const v = S.v[f.k] ?? '';
    return `<div class="fld${wide}"><label class="lab" for="i-${f.k}">${esc(f.label)}</label><input type="${f.type || 'text'}" id="i-${f.k}" data-k="${f.k}" value="${esc(v)}"${f.ph ? ` placeholder="${esc(f.ph)}"` : ''} autocomplete="off"></div>`;
  }
  case 'area':
    return `<div class="fld wide"><label class="lab" for="i-${f.k}">${esc(f.label)}</label><textarea id="i-${f.k}" data-k="${f.k}"${f.ph ? ` placeholder="${esc(f.ph)}"` : ''}>${esc(S.v[f.k] ?? '')}</textarea></div>`;
  case 'num': case 'seg': case 'chips':
    if (f.lr) return `<div class="fld${f.t === 'seg' ? ' wide' : wide}">${lab}<div class="lr"><span class="side">L</span>${inputHTML(f.k + '_L', f)}<span class="side">R</span>${inputHTML(f.k + '_R', f)}</div></div>`;
    return `<div class="fld${wide}">${lab}${inputHTML(f.k, f)}</div>`;
  case 'light': {
    const one = k => `<div class="light">${inputHTML(k, f)}${tlHTML(k, f.cl)}</div>`;
    if (f.lr) return `<div class="fld wide">${lab}<div class="lr"><span class="side">L</span>${one(f.k + '_L')}<span class="side">R</span>${one(f.k + '_R')}</div></div>`;
    return `<div class="fld wide">${lab}${one(f.k)}</div>`;
  }
  case 'bio': {
    const c = S.v.bio;
    const t = {r:'Low arch', y:'Medium arch', b:'High arch'};
    return `<div class="fld">${lab}<div class="tl">${['r','y','b'].map(x => `<button type="button" data-bio="${x}" data-c="${x}" aria-pressed="${c === x}"><b>${CNAME[x]}</b><span>${t[x]}</span></button>`).join('')}</div></div>`;
  }
  case 'ischial':
    return `<div class="fld">${lab}${inputHTML('ischial', {t:'num', unit:'mm', label:f.label})}<div class="hint" data-x="ischial"></div></div>`;
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
  return `<div class="ang"><div><div class="nm">${esc(f.label)}</div><div class="gd">${r ? `Guide ${fmt(r[0])}–${fmt(r[1])}${f.unit === '°' ? '°' : ' ' + f.unit}` : 'Recorded only'}</div></div>
    <div class="pp">
      <div class="fld"><label class="lab" for="i-${f.k}_pre">Before</label><div class="num"><input type="text" inputmode="decimal" id="i-${f.k}_pre" data-k="${f.k}_pre" data-num value="${S.v[f.k + '_pre'] ?? ''}"><span class="u">${f.unit}</span></div></div>
      <div class="fld"><label class="lab" for="i-${f.k}_post">After</label><div class="num"><input type="text" inputmode="decimal" id="i-${f.k}_post" data-k="${f.k}_post" data-num value="${S.v[f.k + '_post'] ?? ''}"><span class="u">${f.unit}</span></div></div>
    </div>
    <div class="gauge-wrap" data-x="gauge" data-k="${f.k}" data-u="${f.unit}"></div></div>`;
}
function gaugeHTML(k, unit){
  const pre = num(k + '_pre'), post = num(k + '_post'), r = range(k);
  const vals = [pre, post].filter(x => x != null);
  if (!vals.length && !r) return '<div class="gread"><span class="hint">Enter before and after</span></div>';
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
  return `<div class="btable"><div class="brow hd"><span>Measurement</span><span>Before</span><span>After</span><span style="text-align:right">Change</span></div>
    ${rows.filter(applies).map(r => { const head = r.g && r.g !== g ? `<div class="bgrp">${esc(r.g)}</div>` : ''; g = r.g;
      return head + `<div class="brow"><div class="nm">${esc(r.label)}${r.hint ? `<small>${esc(r.hint)}</small>` : ''}</div>
      <div class="cell" data-l="Before">${stepper(r.k + '_pre', r)}</div><div class="cell" data-l="After">${stepper(r.k + '_post', r)}</div>
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
  let h = `<div class="sec"><div class="sec-h"><h2>Bike set-up</h2><div class="right"><span class="sec-note">Tap − / + to nudge, or type a value</span><button type="button" class="btn sm" data-act="copy-same">Copy unchanged to After</button></div></div><div id="copy-msg"></div>${rowsHTML(BIKE)}</div>
  <div class="sec"><div class="sec-h"><h2>Cleats</h2></div><div class="grid">
    ${fieldHTML(T('cleatL','Left cleat',{ph:'e.g. 1.2 cm behind M1, neutral'}))}${fieldHTML(T('cleatR','Right cleat'))}</div></div>`;
  if (S.fit === 'tt') h += `<div class="sec"><div class="sec-h"><h2>TT cockpit</h2><span class="tag-fit">TT &amp; Tri</span></div>${rowsHTML(TTROWS)}
    <div class="uci" data-x="uci"></div></div>`;
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

/* ---------------- sample photos (drawn, so the demo has something to measure) ---------------- */
function scene(after){
  const W = 1280, H = 860, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#e1e3e6'); gr.addColorStop(0.9, '#c3c7cc'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(20,22,26,.06)'; g.lineWidth = 2;
  for (let x = 40; x < W; x += 80){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 773); g.stroke(); }
  for (let y = 53; y < 773; y += 80){ g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = '#9097a0'; g.fillRect(0, 773, W, H - 773);
  const P = (x, y) => ({x, y}), rad = d => d * Math.PI / 180;
  const BB = P(560, 640), RA = P(355, 605), FA = P(865, 605), sta = rad(73.5);
  const sadH = after ? 367 : 359;
  const seatTop = P(BB.x - Math.cos(sta) * sadH + (after ? 3.5 : 0), BB.y - Math.sin(sta) * sadH);
  const SC = P(BB.x - Math.cos(sta) * 265, BB.y - Math.sin(sta) * 265);
  const HT = P(792, 352), HB = P(810, 432);
  const bar = after ? P(838, 329) : P(845, 346), hoods = P(bar.x + 20, bar.y - 12);
  const hip = P(seatTop.x - 12, seatTop.y - 24);
  const pedal = P(BB.x + 86 * Math.sin(rad(8)), BB.y + 86 * Math.cos(rad(8))), ankle = P(pedal.x - 22, pedal.y - 40);
  const ik = (A, C, l1, l2, pick) => { const dx = C.x - A.x, dy = C.y - A.y; let d = Math.hypot(dx, dy); d = Math.min(d, l1 + l2 - 0.01);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)), ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy);
    const m = P(A.x + ux * a, A.y + uy * a), s1 = P(m.x - uy * h, m.y + ux * h), s2 = P(m.x + uy * h, m.y - ux * h); return pick(s1, s2) ? s1 : s2; };
  const knee = ik(hip, ankle, 230, 230, (a, b) => a.x > b.x);
  const th = rad(after ? 42 : 38), shoulder = P(hip.x + 250 * Math.cos(th), hip.y - 250 * Math.sin(th));
  const elbow = ik(shoulder, hoods, 160, 160, (a, b) => a.y > b.y);
  const L = (a, b, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
  // wheels
  [RA, FA].forEach(a => { g.lineWidth = 18; g.strokeStyle = '#1b1d21'; g.beginPath(); g.arc(a.x, a.y, 168, 0, 7); g.stroke();
    g.lineWidth = 6; g.strokeStyle = '#4a4f57'; g.beginPath(); g.arc(a.x, a.y, 150, 0, 7); g.stroke();
    g.fillStyle = '#1b1d21'; g.beginPath(); g.arc(a.x, a.y, 10, 0, 7); g.fill(); });
  // frame
  const fr = '#24272c';
  L(BB, RA, 12, fr); L(SC, RA, 10, fr); L(BB, SC, 15, fr); L(SC, HT, 14, fr); L(BB, HB, 18, fr); L(HT, HB, 18, fr); L(HB, FA, 12, fr);
  L(SC, P(seatTop.x + 4, seatTop.y + 12), 9, '#6b7179');
  L(HT, P(HT.x - 3, bar.y + 6), 11, '#3a3e45'); L(P(HT.x - 3, bar.y + 4), bar, 12, '#24272c');
  g.strokeStyle = '#24272c'; g.lineWidth = 10; g.beginPath(); g.moveTo(bar.x, bar.y); g.quadraticCurveTo(bar.x + 46, bar.y + 4, bar.x + 34, bar.y + 50); g.quadraticCurveTo(bar.x + 22, bar.y + 70, bar.x + 2, bar.y + 64); g.stroke();
  L(bar, hoods, 14, '#111214');
  g.fillStyle = '#111214'; roundRect(g, seatTop.x - 52, seatTop.y - 9, 104, 16, 8); g.fill();
  L(BB, pedal, 10, '#3a3e45'); g.fillStyle = '#3a3e45'; g.beginPath(); g.arc(BB.x, BB.y, 30, 0, 7); g.fill();
  // rider
  const skin = '#d9a67f';
  L(knee, ankle, 34, skin); L(P(ankle.x - 4, ankle.y - 10), ankle, 30, '#f2f2f2');
  L(ankle, P(pedal.x + 34, pedal.y - 4), 26, '#16181b');
  L(hip, knee, 50, '#16181b');
  L(shoulder, elbow, 30, '#e5141c'); L(elbow, hoods, 24, skin);
  g.fillStyle = '#16181b'; g.beginPath(); g.arc(hoods.x, hoods.y, 14, 0, 7); g.fill();
  L(hip, shoulder, 74, '#e5141c'); L(P(hip.x + 6, hip.y + 4), P(hip.x + 50 * Math.cos(th), hip.y - 50 * Math.sin(th)), 70, '#16181b');
  const neck = P(shoulder.x + 28, shoulder.y - 26), head = P(shoulder.x + 54, shoulder.y - 52);
  L(shoulder, neck, 26, skin);
  g.fillStyle = skin; g.beginPath(); g.arc(head.x, head.y, 32, 0, 7); g.fill();
  g.fillStyle = '#24272c'; g.beginPath(); g.ellipse(head.x - 6, head.y - 12, 42, 28, -0.25, Math.PI, 2 * Math.PI); g.fill();
  g.fillRect(head.x + 12, head.y - 6, 22, 8);
  // motion-capture markers
  [hip, knee, ankle, shoulder, elbow, hoods].forEach(q => { g.beginPath(); g.arc(q.x, q.y, 9, 0, 7); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#14161a'; g.stroke(); });
  // label
  g.fillStyle = 'rgba(20,22,26,.86)'; roundRect(g, 32, 30, after ? 290 : 312, 74, 14); g.fill();
  g.fillStyle = '#ffffff'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = "italic 800 46px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.fillText(after ? 'AFTER' : 'BEFORE', 52, 82);
  g.font = "600 18px 'Barlow', sans-serif"; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText('Sample still', after ? 196 : 218, 80);
  return {src:c.toDataURL('image/jpeg', 0.88), w:W, h:H, marks:[{p:[hip, knee, ankle].map(q => [q.x / W, q.y / H])}]};
}
async function ensureSamplePhotos(){
  let changed = false;
  for (const p of S.photos){
    if (p.sample && !p.src){ const r = scene(p.sample === 'after'); p.src = r.src; p.w = r.w; p.h = r.h; if (!p.marks || !p.marks.length) p.marks = r.marks; await composite(p); changed = true; }
    else if (p.src && p.marks.length && !p._comp){ await composite(p); changed = true; }
  }
  if (changed && STEPS[S.step].id === 'photos') renderMain();
}

/* ---------------- insights ---------------- */
function changes(){
  const order = ['sadH','setback','drop','hoods','barReach','stemL','spacers','stemA','barW','crank','tilt','sadW','padStack','padReach','padW','extLen','extA','tipBar','postOff','hx','hy','sx','sy','nose','extFront'];
  return order.map(k => ALLROWS.find(r => r.k === k)).filter(r => r && applies(r) && (S.fit === 'tt' || !TTROWS.includes(r)))
    .map(r => ({r, ...deltaOf(r)})).filter(x => x.ch && isNum(x.d));
}
function lights(){
  const out = [];
  const add = (label, k, cl, show) => { const c = lightOf(k, cl); if (c) out.push({label, c, v:num(k) != null ? fmt(num(k)) + (cl === 'plank' ? ' s' : '°') : CNAME[c]}); };
  add('Lower back flexibility', 'backFlex', 'back');
  if (S.fit !== 'std'){
    add('Core stability (plank)', 'plank', 'plank');
    add('Hamstring, left', 'ham_L', 'ham'); add('Hamstring, right', 'ham_R', 'ham');
    add('Hip restriction, left', 'hipR_L', 'hip'); add('Hip restriction, right', 'hipR_R', 'hip');
    if (S.v.bio) out.push({label:'BioDynamic arch profile', c:S.v.bio, v:{r:'Low arch', y:'Medium arch', b:'High arch'}[S.v.bio]});
  }
  return out;
}
function anglesList(){
  const all = [['legExt','Leg extension','°'],['hipTop','Hip angle, top of stroke','°'],['sacral','Sacral angle','°','FT'],['kops','Knee over pedal spindle','cm'],['bmr','Body mass representation','cm'],['torso','Torso angle','°'],['shoulder','Shoulder angle','°'],['elbow','Elbow angle','°']];
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
function chosenStretches(){ return S.stretches ? new Set(S.stretches) : suggested(); }
function draftSummary(){
  const c = Object.fromEntries(changes().map(x => [x.r.k, x])), v = S.v, out = [];
  const mm = x => fmt(Math.abs(x.d)) + ' mm';
  if (c.sadH) out.push(`${c.sadH.d > 0 ? 'Raised' : 'Lowered'} your saddle by ${mm(c.sadH)}${c.setback ? ` and moved it ${mm(c.setback)} ${c.setback.d < 0 ? 'forward' : 'back'}` : ''}.`);
  else if (c.setback) out.push(`Moved your saddle ${mm(c.setback)} ${c.setback.d < 0 ? 'forward' : 'back'}.`);
  if (filled(v.sadModel_post) && v.sadModel_post !== v.sadModel_pre) out.push(`Changed your saddle to a ${v.sadModel_post}${isNum(v.ischial) ? ` to suit your ${v.ischial} mm sit-bone width` : ''}.`);
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
  if (S.fit === 'std') return {title:'Follow-up appointment', body:'Book a follow-up for £25 if anything needs a tweak once you’ve done a few longer rides.'};
  const d = val('date') ? new Date(val('date') + 'T12:00:00') : new Date(); d.setDate(d.getDate() + 56);
  return {title:'Free follow-up', date:d, body:`Your complimentary 30-minute follow-up is due around ${d.toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'})}. We’ll check how the changes feel after eight weeks of riding.`};
}

function reportStepHTML(){
  const ch = changes().slice(0, 4), L = lights(), A = anglesList(), st = chosenStretches(), sug = suggested(), fu = followUp();
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
  <div class="sec"><div class="sec-h"><h2>Stretching & strengthening</h2><span class="sec-note">Suggested from the assessment: tap to add or remove</span></div>
    <div class="stretches">${STRETCH.map(x => `<button type="button" class="stretch" id="st-${x.k}" data-stretch="${x.k}" aria-pressed="${st.has(x.k)}"><span class="box">${ICON_TICK}</span><span><b>${x.name}${sug.has(x.k) ? '<em>Suggested</em>' : ''}</b><span>${x.dose}</span></span></button>`).join('')}</div></div>
  <div class="sec"><div class="sec-h"><h2>Recommended products</h2></div>
    <div id="prods">${S.products.map((p, i) => `<div class="prow"><input type="text" id="pn-${i}" data-prod="${i}" data-f="n" value="${esc(p.n)}" placeholder="Product" aria-label="Product"><div class="num"><input type="text" inputmode="decimal" id="pp-${i}" data-prod="${i}" data-f="p" value="${esc(p.p)}" aria-label="Price"><span class="u">£</span></div><button type="button" class="x" data-act="prod-del" data-i="${i}" aria-label="Remove product">×</button></div>`).join('')}</div>
    <button type="button" class="btn sm" data-act="prod-add">+ Add product</button></div>
  <div class="sec"><div class="sec-h"><h2>Send to ${esc(val('first') || 'the client')}</h2><span class="sec-note">${esc(fu.title)}${fu.date ? ' · ' + fu.date.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) : ''}</span></div>
    <div class="send"><div style="display:flex;flex-direction:column;gap:12px">
      <div class="fld"><label class="lab" for="i-email2">Client email</label><input type="email" id="i-email2" data-k="email" value="${esc(val('email') || '')}"></div>
      <div class="row-btns"><button type="button" class="btn primary" data-act="preview">Preview report</button><button type="button" class="btn dark" data-act="pdf">Make PDF</button><a class="btn" id="mailto" href="${esc(mailtoHref())}">Open in Mail</a><button type="button" class="btn" data-act="copy-mail">Copy email</button></div>
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
  return `Subject: Your Precision Fit report, ${FITS[S.fit].name}\n\nHi ${first},\n\nThanks for coming in for your ${FITS[S.fit].name} with ${val('fitter') || 'us'}. Your report is attached: it has your new bike measurements, before and after photos, and the stretches we talked about.\n\n${fu.body}\n\nRide it for a couple of weeks and let us know how it feels.\n\n${val('fitter') || 'The fit team'}\nPrecision Fit Studio, Pedal Revolution\n63–67 Bethel Street, Norwich NR2 1NR · 01603 614400\nprecisionfit@pedalrevolution.co.uk`;
}

/* ---------------- starting position: from the body to the bike ---------------- */
// The rider's measurements, once, and from them a starting set-up for each part of the bike: how it's worked out, the
// bike as it is now, and one tap to make it the After value (fine-tuned after that on the bike, with motion capture).
// The rules are the studio's starting points, not answers: change them here.
const BAR_SIZES = [360, 380, 400, 420, 440, 460];        // handlebar widths, centre to centre
const SADDLE_SIZES = [128, 138, 145, 155, 168];          // Bontrager saddle widths
const POSTURE_ADD = {low:[10, 20], mid:[15, 25], up:[25, 35]};   // saddle width over sit bones, by how upright the rider sits
const DROP_BY_FLEX = {g:[70, 100], y:[45, 75], r:[10, 40]};      // saddle to bar drop, by hamstring and lower back flexibility
const CRANK_BY_INSEAM = [[75, 165], [81, 167.5], [87, 170], [93, 172.5], [Infinity, 175]];   // inseam under (cm) → crank (mm)
const nearest = (list, x) => list.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a);
const postureOf = () => /Racer|Triathlete/.test(val('style') || '') || S.fit === 'tt' ? 'low' : val('style') === 'Recreational' ? 'up' : 'mid';
function flexLight(){
  const cs = [lightOf('ham_L', 'ham'), lightOf('ham_R', 'ham'), lightOf('backFlex', 'back')].filter(Boolean);
  return cs.length ? (cs.includes('r') ? 'r' : cs.includes('y') ? 'y' : 'g') : null;
}
function startRecs(){
  const inseam = num('inseam'), isch = num('ischial'), sh = num('shWidth'), out = [];
  const posture = postureOf(), postureTxt = {low:'a low, racing posture', mid:'a mid posture', up:'an upright posture'}[posture];
  out.push(inseam == null ? {k:'sadH', label:'Saddle height', need:'inseam'} :
    {k:'sadH', label:'Saddle height', u:'mm', val:Math.round((inseam - 10) * 10), basis:`Inseam ${fmt(inseam)} cm − 10 cm`, check:`Cross-check, inseam × 0.883: ${Math.round(inseam * 8.83)} mm`});
  if (isch == null) out.push({k:'sadW', label:'Saddle width', need:'sit-bone width'});
  else { const [a, b] = POSTURE_ADD[posture], v = nearest(SADDLE_SIZES, isch + (a + b) / 2);
    out.push({k:'sadW', label:'Saddle width', u:'mm', val:v, basis:`Sit bones ${fmt(isch)} mm + ${a}–${b} mm for ${postureTxt}`, check:`${isch + a}–${isch + b} mm: nearest saddle ${v} mm`}); }
  if (sh == null) out.push({k:'barW', label:'Handlebar width', need:'shoulder width'});
  else { const v = nearest(BAR_SIZES, sh * 10); out.push({k:'barW', label:'Handlebar width', u:'mm', val:v, basis:`Shoulder width ${fmt(sh)} cm`, check:'Matched to the shoulders, centre to centre'}); }
  if (S.fit !== 'std'){
    if (inseam == null) out.push({k:'crank', label:'Crank length', need:'inseam'});
    else { const v = CRANK_BY_INSEAM.find(([m]) => inseam < m)[1], hip = [lightOf('hipR_L', 'hip'), lightOf('hipR_R', 'hip')].includes('r');
      out.push({k:'crank', label:'Crank length', u:'mm', val:v, basis:`Inseam ${fmt(inseam)} cm`, check:hip ? 'Hip restriction is red: think about one size shorter' : 'Shorter if the hip angle stays closed at the top'}); }
    const fl = flexLight();
    if (!fl) out.push({k:'drop', label:'Saddle to bar drop', need:'hamstring or lower back flexibility'});
    else { const [a, b] = DROP_BY_FLEX[fl], v = Math.round((posture === 'low' ? b - 10 : posture === 'up' ? a + 10 : (a + b) / 2) / 5) * 5;
      out.push({k:'drop', label:'Saddle to bar drop', u:'mm', val:v, basis:`Flexibility ${CNAME[fl].toLowerCase()} (hamstrings, lower back), ${postureTxt}`, check:`${a}–${b} mm for ${CNAME[fl].toLowerCase()} flexibility`}); }
    const L = num('footAng_L'), R = num('footAng_R');
    if (L == null && R == null) out.push({k:'cleat', label:'Cleats', need:'foot angle standing'});
    else { const txt = a => `1 cm behind M1, toe out ${fmt(a ?? 0)}°`;
      out.push({k:'cleat', label:'Cleats', text:true, valL:txt(L), valR:txt(R), val:`L ${fmt(L ?? 0)}° · R ${fmt(R ?? 0)}° toe out`, basis:`Foot angle standing: L ${fmt(L ?? 0)}°, R ${fmt(R ?? 0)}°`, check:'Rotation matches the standing foot; 1 cm behind M1 to start'}); }
  }
  return out;
}
function startRecHTML(){
  return startRecs().map(r => {
    if (r.need) return `<div class="sp-rec off"><div class="sp-nm">${esc(r.label)}<small>Add the rider’s ${esc(r.need)} to get a starting point</small></div></div>`;
    let now = '', after = '', set = false;
    if (r.text){
      set = S.v.cleatL === r.valL && S.v.cleatR === r.valR;
      after = set ? '<span class="pill g">Set as After</span>' : (S.v.cleatL || S.v.cleatR) ? '<span class="pill n">Cleat notes written</span>' : '';
    } else {
      const pre = num(r.k + '_pre'), post = num(r.k + '_post'), u = r.u === '°' ? '°' : ' ' + r.u;
      now = pre != null ? `Bike now ${fmt(pre)}${u}${pre !== r.val ? ` · ${signed(r.val - pre, r.u)} to start` : ' · already there'}` : 'Bike now: not measured';
      set = post === r.val;
      after = post == null ? '' : set ? '<span class="pill g">Set as After</span>' : `<span class="pill n">After ${fmt(post)}${u} · fine-tuned ${signed(post - r.val, r.u)}</span>`;
    }
    return `<div class="sp-rec"><div class="sp-nm">${esc(r.label)}<small>${esc(r.basis)}</small></div>
      <div class="sp-v${r.text ? ' txt' : ''}">${r.text ? esc(r.val) : `${fmt(r.val)}<span>${r.u === '°' ? '°' : ' ' + r.u}</span>`}<small>${esc(r.check)}</small></div>
      <div class="sp-st">${now ? `<span>${esc(now)}</span>` : ''}${after}</div>
      <div class="sp-go">${set ? '' : `<button type="button" class="btn sm dark" data-act="start-apply" data-k="${r.k}">Use as After</button>`}</div></div>`;
  }).join('');
}
function startHTML(){
  const inp = (k, label, unit) => `<div class="fld"><label class="lab" for="i-${k}">${label}</label>${inputHTML(k, {t:'num', unit, label})}</div>`;
  const fl = S.fit === 'std' ? null : flexLight();
  return `<div class="sp-sub">Body measurements</div>
    <div class="sp-grid">${inp('height', 'Height', 'cm')}${inp('inseam', 'Inseam', 'cm')}${inp('ischial', 'Sit-bone width', 'mm')}${inp('shWidth', 'Shoulder width', 'cm')}
      ${S.fit === 'std' ? '' : inp('footAng_L', 'Foot angle L', '°') + inp('footAng_R', 'Foot angle R', '°')}</div>
    <div class="sp-ctx"><span class="pill n">Riding style: ${esc(val('style') || 'not set')}</span>${S.fit === 'std' ? '' : `<span class="pill ${fl || 'n'}">Flexibility: ${fl ? CNAME[fl] : 'not assessed'}</span>`}
      <span class="hint">The same measurements as the off-bike assessment: change them in either place.</span></div>
    <div class="sp-sub sp-row"><span>Suggested starting set-up</span><button type="button" class="btn sm" data-act="start-all">Use all for empty After values</button></div>
    <div class="sp-recs" data-x="startrec"></div><div id="start-msg"></div>
    <div class="sp-sub">Before the first pedal stroke</div>${fieldHTML(CK('startChk', ['Saddle set level', 'Shifters level with the tops of the bar']))}`;
}
function applyStart(r){
  if (r.text){ S.v.cleatL = r.valL; S.v.cleatR = r.valR; } else S.v[r.k + '_post'] = r.val;
}

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
  B.push({html:`<div class="rp-meta"><div><span>Customer</span><b>${esc(name)}</b></div><div><span>Date</span><b>${esc(dateTxt)}</b></div><div><span>Technician</span><b>${esc(v.fitter || '')}</b></div><div><span>Fit</span><b>${esc(fit.name)}</b></div>
    <div><span>Bike</span><b>${esc(v.bike || '')}</b></div><div><span>Frame size</span><b>${esc(v.frame || '')}</b></div><div><span>Pedals</span><b>${esc(v.pedals || '')}</b></div><div><span>Shoes</span><b>${esc(v.shoes || '')}</b></div></div>`});
  if (ch.length) B.push({html:sec('Key changes', `<div class="rp-kcs">${ch.slice(0, 4).map(x => `<div class="rp-kc"><span>${esc(x.r.label)}</span><b>${fmt(v[x.r.k + '_pre'])} → ${fmt(v[x.r.k + '_post'])}</b><i>${x.txt}</i></div>`).join('')}</div>`)});
  if (v.summary) B.push({html:sec('What we changed and why', `<p class="rp-p">${esc(v.summary)}</p>`)});
  if (A.length) B.push({title:'Your position on the bike', head:'<p class="rp-p" style="color:var(--p-mute);font-size:12.5px">Hollow dot: before the fit. Solid dot: after. The green band is the range we aim for.</p>', foot:'',
    rows:A.map(a => { const ok = a.r && a.post != null ? a.post >= a.r[0] && a.post <= a.r[1] : null;
      return `<div class="rp-ang"><div><div class="nm">${esc(a.label)}</div><div style="font-size:11.5px;color:var(--p-mute)">${a.r ? `Guide ${fmt(a.r[0])}–${fmt(a.r[1])}${u(a.u)}` : 'Recorded'}</div></div>
        <div class="val">${a.pre != null ? fmt(a.pre) + u(a.u) : '–'} → ${a.post != null ? fmt(a.post) + u(a.u) : '–'}</div>
        <div>${gaugeOnly(a.k)}</div><div>${ok == null ? '' : `<span class="rp-pill ${ok ? 'g' : 'r'}">${ok ? 'In range' : 'Outside'}</span>`}</div></div>`; })});
  const cell = (r, k) => esc(r.t === 'text' ? v[k] ?? '' : v[k] != null && v[k] !== '' ? fmt(v[k]) + u(r.u) : '');
  const trs = rows => rows.filter(applies).filter(r => filled(v[r.k + '_pre']) || filled(v[r.k + '_post'])).map(r => { const d = deltaOf(r);
    return `<tr><td>${esc(r.label)}</td><td>${cell(r, r.k + '_pre')}</td><td class="c">${cell(r, r.k + '_post')}</td><td class="${d.ch ? 'ch' : ''}">${d.txt === '–' ? '' : d.txt}</td></tr>`; });
  const TH = '<table class="rp-tbl"><thead><tr><th style="width:36%">Measurement</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>';
  const bike = trs(BIKE);
  if (bike.length) B.push({title:'Bike measurements', head:TH, foot:'</tbody></table>', rows:bike,
    tail:'<p class="rp-p" style="font-size:11.5px;color:var(--p-mute);margin-top:10px">All measurements in millimetres unless shown. Keep this report with your bike: it lets any mechanic put your position back exactly.</p>'});
  if (v.cleatL || v.cleatR) B.push({html:sec('Cleats', `<ul class="rp-lst"><li><span>Left</span><b>${esc(v.cleatL || '–')}</b></li><li><span>Right</span><b>${esc(v.cleatR || '–')}</b></li></ul>`)});
  if (S.fit === 'tt'){ const tt = trs(TTROWS); if (tt.length) B.push({title:'TT cockpit', head:TH, foot:'</tbody></table>', rows:tt}); }
  const pains = Object.entries(S.pain).filter(([, x]) => x);
  const obs = [['Arch height (L / R)', S.fit !== 'std' && [v.arch_L, v.arch_R].some(Boolean) ? `${v.arch_L || '–'} / ${v.arch_R || '–'}` : ''], ['Knee alignment (L / R)', S.fit !== 'std' && (v.knee_L || v.knee_R) ? `${v.knee_L || '–'} / ${v.knee_R || '–'}` : ''],
    ['Pelvis', S.fit !== 'std' ? v.pelvis : ''], ['Sit-bone width', isNum(v.ischial) ? v.ischial + ' mm' : ''], ['Shoulder width', isNum(v.shWidth) ? v.shWidth + ' cm' : ''],
    ['Shoulders drawn forward', S.fit !== 'std' ? v.shFwd : ''], ['Inseam', isNum(v.inseam) ? v.inseam + ' cm' : ''], ['Knee tracking on bike (L / R)', S.fit !== 'std' && (v.kneeTrack_L || v.kneeTrack_R) ? `${v.kneeTrack_L || '–'} / ${v.kneeTrack_R || '–'}` : '']].filter(x => x[1]);
  if (Ls.length || obs.length) B.push({html:`<div class="rp-two">${Ls.length ? sec('Mobility & stability', `<ul class="rp-lst">${Ls.map(x => `<li><span>${esc(x.label)}</span><span><span style="margin-right:8px;font-variant-numeric:tabular-nums">${esc(x.v)}</span><span class="rp-pill ${x.c}">${CNAME[x.c]}</span></span></li>`).join('')}</ul>`) : ''}
    ${obs.length ? sec('Posture & alignment', `<ul class="rp-lst">${obs.map(x => `<li><span>${esc(x[0])}</span><b>${esc(x[1])}</b></li>`).join('')}</ul>`) : ''}</div>`});
  const told = [v.goals && v.goals.length ? `<p class="rp-p"><b>Goals:</b> ${esc(v.goals.join(', '))}${v.goalNote ? '. ' + esc(v.goalNote) : ''}</p>` : '',
    pains.length ? `<p class="rp-p"><b>Discomfort:</b> ${pains.map(([k, x]) => `<span class="rp-pill ${x === 2 ? 'r' : 'y'}" style="margin-right:4px">${PAIN[k]}</span>`).join(' ')}</p>` : '',
    v.problems ? `<p class="rp-p">${esc(v.problems)}</p>` : '', v.activities ? `<p class="rp-p"><b>Current weekly activities:</b> ${esc(v.activities)}</p>` : '',
    v.injuries ? `<p class="rp-p"><b>Injuries & special notes:</b> ${esc(v.injuries)}</p>` : ''].join('');
  if (told) B.push({html:sec('What you told us', told)});
  if (v.fitNotes) B.push({html:sec('Fitter’s notes', `<p class="rp-p">${esc(v.fitNotes)}</p>`)});
  const ph = S.fit === 'std' ? [] : S.photos.filter(p => p.inc && p.src);
  if (ph.length){
    const card = (p, big) => `<div class="rp-ph${big ? ' big' : ''}"><div class="im" style="background-image:url('${p._comp || p.src}')"></div><b>${esc(p.tag)}</b>${p.cap ? `<span>${esc(p.cap)}</span>` : ''}</div>`;
    const side = ['Before · side', 'After · side'].map(t => ph.find(p => p.tag === t)).filter(Boolean), rest = ph.filter(p => !side.includes(p));
    if (side.length) B.push({html:sec('Before & after', `<div class="rp-photos">${side.map(p => card(p, true)).join('')}</div>`)});
    for (let i = 0; i < rest.length; i += 2) B.push({html:sec(i === 0 ? 'Fit photos' : '', `<div class="rp-photos">${rest.slice(i, i + 2).map(p => card(p)).join('')}</div>`)});
  }
  const st = [...chosenStretches()].map(k => STRETCH.find(x => x.k === k)).filter(Boolean), fu = followUp(), prods = S.products.filter(p => p.n);
  if (st.length) B.push({html:sec('Stretching & strengthening', `<div class="rp-plan">${st.map(x => `<div><b>${esc(x.name)}</b><span>${esc(x.dose)}</span></div>`).join('')}</div>`)});
  if (prods.length) B.push({html:sec('Recommended for you', `<ul class="rp-lst">${prods.map(p => `<li><span>${esc(p.n)}</span><b>${p.p ? '£' + esc(p.p) : ''}</b></li>`).join('')}</ul>`)});
  // (settling in and the follow-up kept together: the report never ends on the follow-up alone)
  B.push({html:sec('Settling in', '<p class="rp-p">Give your body two to three weeks to adapt. Build ride length gradually and note anything that feels different, good or bad. Small aches usually settle; sharp or lasting pain means we should look again.</p>') + `<div class="rp-cta"><div><b>${esc(fu.title)}</b><span>${esc(fu.body)}</span></div><div style="text-align:right;font-size:12.5px;white-space:nowrap">01603 614400<br>precisionfit@pedalrevolution.co.uk</div></div>`});
  return B;
}
const rowsBlock = (b, i, j, cont) => `<div class="rp-sec"><h3 class="rp-h">${b.title}${cont ? '<span class="rp-cont">continued</span>' : ''}</h3>${cont ? '' : b.head.startsWith('<p') ? b.head : ''}${b.head.startsWith('<p') ? '' : b.head}${b.rows.slice(i, j).join('')}${b.foot}${j === b.rows.length ? b.tail || '' : ''}</div>`;
function reportPages(){
  const fit = FITS[S.fit], name = fullName() || 'Client', cap = $('#cap');
  const band = big => `<div class="rp-band${big ? '' : ' sm'}"><img src="${LOGO}" alt=""><div><div class="rp-k">${esc(fit.name)} · ${esc(name)}</div><div class="rp-t">Precision Fit Report</div></div></div>`;
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
  return pages.map((items, i) => `<div class="rp-page">${band(i === 0)}<div class="rp-in">${items.join('')}</div><div class="rp-foot"><span>Pedal Revolution · Precision Fit Studio · 63–67 Bethel Street, Norwich NR2 1NR · 01603 614400</span><span>${i + 1} / ${pages.length}</span></div></div>`);
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
async function buildPDF(onStep){
  await loadScript(new URL('vendor/html2canvas.min.js', document.baseURI).href);
  await loadScript(new URL('vendor/jspdf.umd.min.js', document.baseURI).href);
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
    ...(S.fit === 'std' ? [] : [{ok:sides === 2, t:'Before & after side photos', d:`${sides} of 2 taken`, step:5}]),
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
  const banner = S.sample ? `<div class="banner"><span class="sp"><b>Sample fit.</b> Jordan Hale is an example rider, so you can see a finished fit. Your own fits are kept on this device: find them under Fits.</span>
    <button type="button" class="btn sm dark" id="btn-new" data-act="new">Start a new fit</button></div>` : '';
  $('#main').innerHTML = `${banner}<div class="step-head"><div class="eyebrow">Step ${stepNo(S.step)} · ${FITS[S.fit].name}</div><h1>${st.title}</h1><p class="lede">${st.lede}</p></div>
    ${jumpHTML(st.id)}${sectionsFor(st.id).map(secHTML).join('')}
`;
  refresh(); renderRail(); renderHeader();
  const rail = $('#rail'), cur = $('#rail [aria-current]');
  if (cur && getComputedStyle(rail).flexDirection === 'row') rail.scrollLeft += cur.getBoundingClientRect().left - rail.getBoundingClientRect().left - rail.clientWidth / 2 + cur.clientWidth / 2;
  if (st.id === 'photos') wireDrop();
}
function refresh(){
  $$('[data-x]').forEach(el => {
    const k = el.dataset.k;
    switch (el.dataset.x){
    case 'tl': { const c = lightOf(k, el.dataset.cl); $$('button', el).forEach(b => b.setAttribute('aria-pressed', b.dataset.c === c)); break; }
    case 'gauge': el.innerHTML = gaugeHTML(k, el.dataset.u); break;
    case 'delta': { const r = ALLROWS.find(x => x.k === k), d = deltaOf(r); el.textContent = d.txt; el.classList.toggle('ch', d.ch); break; }
    case 'inseam': { const n = num('inseam'); el.innerHTML = n != null ? `<span>Starting saddle height</span><b>${fmt(n - 10)} cm</b><span class="hint">inseam − 10 cm</span>` : '<span class="hint">Starting saddle height appears here: inseam − 10 cm</span>'; break; }
    case 'ischial': { const n = num('ischial'); el.innerHTML = n == null ? '' : `<span class="pill ${n < 100 ? 'b' : n <= 130 ? 'g' : 'y'}">${n < 100 ? 'Narrow' : n <= 130 ? 'Medium' : 'Wide'}</span> Saddle around ${Math.round((n + 15) / 5) * 5}–${Math.round((n + 25) / 5) * 5} mm wide, depending on posture`; break; }
    case 'painlist': el.innerHTML = painListHTML(); break;
    case 'startrec': el.innerHTML = startRecHTML(); break;
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
  if (d.stretch){ const s = chosenStretches(); s.has(d.stretch) ? s.delete(d.stretch) : s.add(d.stretch); S.stretches = [...s]; t.setAttribute('aria-pressed', s.has(d.stretch)); save(); return; }
  switch (d.act){
  case 'next': return go(S.step + 1);
  case 'back': return go(S.step - 1);
  case 'preview': return openReport();
  case 'close-ov': $('#ov').hidden = true; return;
  case 'pdf': return savePDF(t.closest('#ov') ? $('#ov-msg') : $('#send-msg'));
  case 'timer': return toggleTimer();
  case 'start-apply': {
    const r = startRecs().find(x => x.k === d.k); if (!r || r.need) return;
    const cur = r.text ? (S.v.cleatL || S.v.cleatR) : S.v[r.k + '_post'];
    if (filled(cur) && t.dataset.arm !== '1'){ t.dataset.arm = '1'; t.textContent = 'Tap to replace After'; t.classList.replace('dark', 'primary'); setTimeout(() => { if (t.isConnected){ t.dataset.arm = ''; t.textContent = 'Use as After'; t.classList.replace('primary', 'dark'); } }, 3000); return; }
    applyStart(r); save(); refresh(); renderRail(); return; }
  case 'start-all': {
    let n = 0;
    startRecs().filter(r => !r.need).forEach(r => { if (!filled(r.text ? (S.v.cleatL || S.v.cleatR) : S.v[r.k + '_post'])){ applyStart(r); n++; } });
    save(); refresh(); renderRail();
    const m = $('#start-msg'); if (m) m.innerHTML = `<div class="msg${n ? ' ok' : ''}" style="margin-top:10px">${n ? `${n} After value${n > 1 ? 's' : ''} set from the suggestions. Fine-tune them on the bike.` : 'Every suggestion already has an After value. Use as After on one to replace it.'}</div>`;
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
  case 'fit-open': { const f = FITLIST.find(x => x.id === d.id); if (f) openFit(f.id === 'sample' && !f.created ? sampleState() : f); return; }
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
  S = await load();
  renderMain();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  try { if (document.fonts) await Promise.race([document.fonts.load("italic 800 46px 'Barlow Condensed'"), new Promise(r => setTimeout(r, 2500))]); } catch(_){}
  await ensureSamplePhotos();
  if (STEPS[S.step].id === 'photos') renderMain();
})();
