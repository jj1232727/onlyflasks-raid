import {readFile,mkdir,writeFile} from "node:fs/promises";
import {extraBosses} from "../src/extra-raids.js";
const read=async(p,f)=>{try{return JSON.parse(await readFile(p,"utf8"))}catch{return f}};
const roster=await read("data/roster.json",{characters:[]}),gear=await read("data/gear.json",{characters:[]}),bis=await read("data/bis/icy-veins-midnight-s2.json",{lists:{}}),raid=await read("data/raid-loot.json",{bosses:[]}),raidEffects=await read("data/raid-effects.json",{items:{}}),seasonLoot=await read("data/season-loot.json",{items:[]}),sims=await read("data/wowaudit-wishlists.json",{characters:[]}),lootHistory=await read("data/wowaudit-loot-history.json",{history_items:[]}),auditActivity=await read("data/wowaudit-audit.json",{characters:[]}),raiderio=await read("data/raiderio-audit.json",{characters:[]}),itemIcons=await read("data/item-icons.json",{});
const tierSlots={Idol:"Hands",Remnant:"Shoulders",Icon:"Chest",Relic:"Legs",Effigy:"Helm"},tierArmor={Venomwoven:"Cloth",Venomcured:"Leather",Venomcast:"Mail",Venomforged:"Plate"};
for(const boss of raid.bosses){boss.raid=raid.raid;boss.items=boss.items.flatMap(item=>{const effect=raidEffects.items?.[item.itemId]||{};if(item.slot)return[{...item,...effect}];const family=Object.keys(tierArmor).find(x=>item.name.startsWith(x)),token=Object.keys(tierSlots).find(x=>item.name.endsWith(x));return family&&token?[{...item,...effect,slot:tierSlots[token],armorType:tierArmor[family],tierToken:true}]:[]});}
// Raids the addon export cannot reach — see src/extra-raids.js.
const extra=extraBosses(seasonLoot,raidEffects);
// A boss from outside the positional table MUST carry its own levels, or the
// board silently prices its loot at whatever the table holds at that index.
for(const boss of extra)if(!boss.levels?.normal||!boss.levels?.heroic||!boss.levels?.mythic)throw new Error(`Refusing to write public/loot-data.json: ${boss.name} has no item levels.`);
// The whole point is that this boss is not on the main lockout, so its absence
// is a silent hole in every "what is worth running" view. Say so loudly.
if(!extra.length)throw new Error("Refusing to write public/loot-data.json: no bosses came back for the extra raids. Run \"npm run season:loot\" — data/season-loot.json is the source for them.");
raid.bosses=[...raid.bosses,...extra];
const defaults={"Evoker|Heal":"Preservation Evoker","Druid|Ranged":"Balance Druid","Druid|Heal":"Restoration Druid","Monk|Heal":"Mistweaver Monk","Mage|Ranged":"Arcane Mage","Warrior|Melee":"Fury Warrior","Warrior|Tank":"Protection Warrior","Hunter|Ranged":"Beast Mastery Hunter","Hunter|Melee":"Survival Hunter","Demon Hunter|Ranged":"Devourer Demon Hunter","Paladin|Melee":"Retribution Paladin","Paladin|Heal":"Holy Paladin","Warlock|Ranged":"Destruction Warlock","Death Knight|Melee":"Frost Death Knight","Death Knight|Tank":"Blood Death Knight","Shaman|Heal":"Restoration Shaman","Rogue|Melee":"Assassination Rogue","Priest|Heal":"Holy Priest"},byId=new Map(gear.characters.map(x=>[x.character.wowauditId,x.equipment]));
const statusFor=c=>/fill/i.test(`${c.rank} ${c.raw?.note||""}`)?"Fill":/trial/i.test(`${c.rank} ${c.raw?.note||""}`)?"Trial":"Main";
const characters=roster.characters.map(({raw,...c})=>({...c,rosterStatus:statusFor({...c,raw}),defaultSpec:defaults[`${c.class}|${c.role}`]||"",equipment:(byId.get(c.id)||[]).map(({raw:itemRaw,...i})=>{const crafted=(i.bonusList||[]).includes(12214),effect=itemRaw?.spells?.[0]?.spell?.name,secondaryStats=(itemRaw?.stats||[]).filter(stat=>/CRIT|HASTE|MASTERY|VERSATILITY/.test(stat.type?.type||"")).map(stat=>({type:stat.type.type,value:Number(stat.value||0)}));return{...i,secondaryStats,isWeapon:itemRaw?.item_class?.id===2,crafted,embellished:Boolean(crafted&&effect),...(crafted&&effect?{embellishmentName:effect}:{})}})}));
// public/loot-data.json has two producers: CI on a schedule, and a developer
// running this by hand. But roster.json and gear.json are gitignored, so CI
// always fetches them fresh while a local copy is whatever was last pulled
// down. Rebuilding locally therefore replaces CI's current data with stale
// gear, silently, and the board reports gear hours older than everything else.
// Never move refreshedAt backwards; --allow-stale is the deliberate override.
const refreshedAt=gear.fetchedAt||roster.fetchedAt,existing=await read("public/loot-data.json",null),allowStale=process.argv.includes("--allow-stale");
if(existing?.refreshedAt&&refreshedAt&&Date.parse(refreshedAt)<Date.parse(existing.refreshedAt)&&!allowStale){
  const age=(t)=>`${((Date.now()-Date.parse(t))/3600000).toFixed(1)}h old`;
  console.error(`Refusing to rebuild with older data than is already published.
  existing public/loot-data.json : ${existing.refreshedAt} (${age(existing.refreshedAt)})
  this rebuild would write       : ${refreshedAt} (${age(refreshedAt)})
Your data/roster.json and data/gear.json are gitignored, so they are not updated by CI refreshes.
Run "npm run audit:refresh" to fetch them, or let the scheduled refresh rebuild it.
Pass --allow-stale only if you deliberately want to publish older gear.`);
  process.exit(1);
}
// Every read above falls back to an empty shape on a missing file, which once
// published a board with zero bosses because data/raid-loot.json was gitignored
// and absent from the CI checkout. Refuse to write a payload that is obviously
// incomplete rather than deploying a silently empty site.
const built={raid,seasonLoot,characters,bis,sims,lootHistory,auditActivity,raiderio,itemIcons,specs:Object.keys(bis.lists),refreshedAt};
const empty=[
  ["characters",characters.length],
  ["raid.bosses",raid.bosses?.length||0],
  ["bis.lists",Object.keys(bis.lists||{}).length],
  ["seasonLoot.items",seasonLoot.items?.length||0],
].filter(([,count])=>!count).map(([name])=>name);
if(empty.length)throw new Error(`Refusing to write public/loot-data.json: ${empty.join(", ")} came back empty. A source file is missing — check that its data/ input exists and is not gitignored.`);
// Icons are a separate enrichment pass over gear.json. Skipping it does not
// break the build, it just renders every equipped item as a question mark, so
// the failure is invisible until someone looks at the site.
const wornItems=characters.flatMap(c=>c.equipment),wornWithIcon=wornItems.filter(i=>i.icon).length;
if(wornItems.length&&!wornWithIcon)throw new Error(`Refusing to write public/loot-data.json: none of ${wornItems.length} equipped items have an icon. Run "npm run gear:icons" after check-gear.js.`);
if(wornWithIcon<wornItems.length)console.warn(`Warning: ${wornItems.length-wornWithIcon} of ${wornItems.length} equipped items have no icon.`);
await mkdir("public",{recursive:true});await writeFile("public/loot-data.json",JSON.stringify(built));console.log(`Built React app data. ${characters.length} characters, ${raid.bosses.length} bosses, ${Object.keys(bis.lists).length} specs.`);
