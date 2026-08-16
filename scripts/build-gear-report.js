import { mkdir, readFile, writeFile } from "node:fs/promises";

const gear = JSON.parse(await readFile("data/gear.json", "utf8"));
const roster = JSON.parse(await readFile("data/roster.json", "utf8"));
const rosterById = new Map(roster.characters.map((character) => [character.id, character]));

const characters = gear.characters.map((entry) => {
  const rosterCharacter = rosterById.get(entry.character.wowauditId) ?? {};
  const gearItems = entry.equipment.filter((item) => item.itemLevel >= 207);
  const averageItemLevel = gearItems.length
    ? gearItems.reduce((sum, item) => sum + item.itemLevel, 0) / gearItems.length
    : 0;
  return {
    ...entry.character,
    class: rosterCharacter.class ?? "Unknown",
    role: rosterCharacter.role ?? "Unknown",
    rank: rosterCharacter.rank ?? "Unknown",
    averageItemLevel,
    equipment: entry.equipment.map(({ raw, ...item }) => item),
  };
});

const reportData = JSON.stringify({
  fetchedAt: gear.fetchedAt,
  tracksResolvedAt: gear.tracksResolvedAt,
  characters,
}).replace(/</gu, "\\u003c");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OnlyFlasks Gear Report</title>
  <style>
    :root { color-scheme: dark; --bg:#090b10; --panel:#121621; --panel2:#191e2c; --line:#293044; --text:#eef2ff; --muted:#9ba5bd; --accent:#7c9cff; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at top,#151c2c 0,#090b10 42rem); color:var(--text); font:14px/1.45 Inter,Segoe UI,system-ui,sans-serif; }
    header { position:sticky; top:0; z-index:5; background:#090b10e8; backdrop-filter:blur(16px); border-bottom:1px solid var(--line); }
    .wrap { max-width:1500px; margin:auto; padding:22px; }
    h1 { margin:0; font-size:25px; letter-spacing:-.02em; }
    .sub { color:var(--muted); margin-top:4px; }
    .controls { display:grid; grid-template-columns:minmax(220px,1fr) repeat(2,minmax(150px,220px)); gap:10px; margin-top:18px; }
    input,select { width:100%; border:1px solid var(--line); background:var(--panel); color:var(--text); border-radius:9px; padding:10px 12px; outline:none; }
    input:focus,select:focus { border-color:var(--accent); }
    .summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:18px 0; }
    .stat { background:linear-gradient(145deg,var(--panel2),var(--panel)); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
    .stat strong { display:block; font-size:22px; }
    .stat span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.06em; }
    #grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(410px,1fr)); gap:14px; }
    .card { background:linear-gradient(155deg,var(--panel2),var(--panel)); border:1px solid var(--line); border-radius:13px; overflow:hidden; box-shadow:0 14px 30px #0005; }
    .card-head { display:flex; justify-content:space-between; gap:15px; padding:15px 16px; border-bottom:1px solid var(--line); }
    .character { font-size:17px; font-weight:700; }
    .meta { color:var(--muted); font-size:12px; margin-top:2px; }
    .ilvl { text-align:right; font-size:18px; font-weight:700; }
    .ilvl small { display:block; color:var(--muted); font-size:10px; font-weight:500; text-transform:uppercase; }
    table { width:100%; border-collapse:collapse; }
    th,td { padding:7px 10px; border-bottom:1px solid #242a3a; text-align:left; vertical-align:middle; }
    th { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.07em; background:#10141e; }
    tr:last-child td { border-bottom:0; }
    td.slot { color:var(--muted); width:92px; font-size:11px; }
    td.item { max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    td.level { width:48px; font-variant-numeric:tabular-nums; font-weight:650; }
    td.track-cell { width:120px; text-align:right; }
    .track { display:inline-flex; gap:4px; border:1px solid currentColor; border-radius:999px; padding:2px 7px; font-size:11px; font-weight:650; white-space:nowrap; }
    .Myth { color:#ff7a7a; background:#ff7a7a12; }
    .Hero { color:#c38cff; background:#c38cff12; }
    .Champion { color:#76a8ff; background:#76a8ff12; }
    .Veteran { color:#65d69a; background:#65d69a12; }
    .Adventurer { color:#e0c46e; background:#e0c46e12; }
    .equivalent::after { content:'≈'; margin-left:2px; opacity:.75; }
    .none { color:#788198; font-size:11px; }
    .empty { color:var(--muted); text-align:center; padding:48px; grid-column:1/-1; }
    @media(max-width:750px){ .controls,.summary{grid-template-columns:1fr 1fr}.controls input{grid-column:1/-1} #grid{grid-template-columns:1fr}.wrap{padding:14px} }
  </style>
</head>
<body>
  <header><div class="wrap">
    <h1>OnlyFlasks Gear Report</h1>
    <div class="sub" id="updated"></div>
    <div class="controls">
      <input id="search" type="search" placeholder="Search character, realm, class, or item…">
      <select id="role"><option value="">All roles</option></select>
      <select id="track"><option value="">All tracks</option></select>
    </div>
  </div></header>
  <main class="wrap"><section class="summary" id="summary"></section><section id="grid"></section></main>
  <script>
    const data=${reportData};
    const slotOrder=['HEAD','NECK','SHOULDER','BACK','CHEST','SHIRT','TABARD','WRIST','HANDS','WAIST','LEGS','FEET','FINGER_1','FINGER_2','TRINKET_1','TRINKET_2','MAIN_HAND','OFF_HAND'];
    const labels={HEAD:'Head',NECK:'Neck',SHOULDER:'Shoulder',BACK:'Back',CHEST:'Chest',SHIRT:'Shirt',TABARD:'Tabard',WRIST:'Wrist',HANDS:'Hands',WAIST:'Waist',LEGS:'Legs',FEET:'Feet',FINGER_1:'Ring 1',FINGER_2:'Ring 2',TRINKET_1:'Trinket 1',TRINKET_2:'Trinket 2',MAIN_HAND:'Main hand',OFF_HAND:'Off hand'};
    const search=document.querySelector('#search'),role=document.querySelector('#role'),track=document.querySelector('#track'),grid=document.querySelector('#grid'),summary=document.querySelector('#summary');
    const escapeHtml=value=>String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
    const unique=values=>[...new Set(values.filter(Boolean))].sort();
    for(const value of unique(data.characters.map(c=>c.role))) role.insertAdjacentHTML('beforeend','<option>'+escapeHtml(value)+'</option>');
    for(const value of ['Myth','Hero','Champion','Veteran','Adventurer','Explorer']) track.insertAdjacentHTML('beforeend','<option>'+value+'</option>');
    document.querySelector('#updated').textContent='Gear refreshed '+new Date(data.fetchedAt).toLocaleString()+' · Tracks resolved '+new Date(data.tracksResolvedAt).toLocaleString();
    function trackBadge(item){
      if(item.track){const equivalent=item.trackKind==='equivalent_track'?' equivalent':'';return '<span class="track '+escapeHtml(item.track)+equivalent+'" title="'+escapeHtml(item.trackVerification)+'">'+escapeHtml(item.track)+(item.trackRank?' '+escapeHtml(item.trackRank):'')+'</span>'}
      if(item.trackVerification==='crafted_no_track') return '<span class="none">Crafted</span>';
      return '<span class="none">—</span>';
    }
    function render(){
      const term=search.value.trim().toLocaleLowerCase(),wantedRole=role.value,wantedTrack=track.value;
      const visible=data.characters.filter(c=>{
        const haystack=[c.name,c.realm,c.class,c.role,...c.equipment.map(i=>i.name)].join(' ').toLocaleLowerCase();
        return (!term||haystack.includes(term))&&(!wantedRole||c.role===wantedRole)&&(!wantedTrack||c.equipment.some(i=>i.track===wantedTrack));
      }).sort((a,b)=>b.averageItemLevel-a.averageItemLevel||a.name.localeCompare(b.name));
      const items=visible.flatMap(c=>c.equipment);
      const ranked=items.filter(i=>i.trackKind==='upgrade_track').length,equivalent=items.filter(i=>i.trackKind==='equivalent_track').length;
      summary.innerHTML=[['Raiders',visible.length],['Average ilvl',visible.length?(visible.reduce((s,c)=>s+c.averageItemLevel,0)/visible.length).toFixed(1):'—'],['Ranked-track items',ranked],['Equivalent-track items',equivalent]].map(([label,value])=>'<div class="stat"><strong>'+value+'</strong><span>'+label+'</span></div>').join('');
      grid.innerHTML=visible.map(c=>{
        const bySlot=new Map(c.equipment.map(i=>[i.slot,i]));
        const rows=slotOrder.filter(slot=>bySlot.has(slot)).map(slot=>{const i=bySlot.get(slot);return '<tr><td class="slot">'+labels[slot]+'</td><td class="item" title="'+escapeHtml(i.name)+'">'+escapeHtml(i.name)+'</td><td class="level">'+escapeHtml(i.itemLevel)+'</td><td class="track-cell">'+trackBadge(i)+'</td></tr>'}).join('');
        return '<article class="card"><div class="card-head"><div><div class="character">'+escapeHtml(c.name)+'</div><div class="meta">'+escapeHtml(c.class)+' · '+escapeHtml(c.role)+' · '+escapeHtml(c.realm)+'</div></div><div class="ilvl">'+c.averageItemLevel.toFixed(1)+'<small>equipped ilvl</small></div></div><table><thead><tr><th>Slot</th><th>Item</th><th>ilvl</th><th style="text-align:right">Track</th></tr></thead><tbody>'+rows+'</tbody></table></article>';
      }).join('')||'<div class="empty">No raiders match these filters.</div>';
    }
    search.addEventListener('input',render);role.addEventListener('change',render);track.addEventListener('change',render);render();
  </script>
</body></html>`;

await mkdir("report", { recursive: true });
await writeFile("report/gear.html", html, "utf8");
console.log(`Built report/gear.html for ${characters.length} characters.`);

