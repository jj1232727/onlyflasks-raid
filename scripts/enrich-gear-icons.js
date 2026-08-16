import { readFile, writeFile } from "node:fs/promises";
import { BlizzardClient } from "../src/blizzard.js";
import { loadEnv } from "../src/env.js";
await loadEnv();
const gear=JSON.parse(await readFile("data/gear.json","utf8"));
const client=new BlizzardClient({clientId:process.env.BLIZZARD_CLIENT_ID,clientSecret:process.env.BLIZZARD_CLIENT_SECRET});
const token=await client.getToken("US"),cache=new Map();let fetched=0;
for(const entry of gear.characters)for(const item of entry.equipment){if(item.icon)continue;if(cache.has(item.itemId)){item.icon=cache.get(item.itemId);continue}const response=await fetch(`https://us.api.blizzard.com/data/wow/media/item/${item.itemId}?namespace=static-us&locale=en_US`,{headers:{authorization:`Bearer ${token}`}});if(!response.ok)continue;const media=await response.json(),icon=media.assets?.find(a=>a.key==="icon")?.value??null;cache.set(item.itemId,icon);item.icon=icon;fetched++}
await writeFile("data/gear.json",`${JSON.stringify(gear,null,2)}\n`,{mode:0o600});console.log(`Added ${fetched} unique equipped-item icons.`);
