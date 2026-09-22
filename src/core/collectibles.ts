import type {Tier} from '../config/validate';
export const MATERIAL_IDS=['holo','reverse','cosmos','glitter','aurora','rainbow','gold','prism','radiant','crystal','metal','oilslick','sunburst','mosaic'] as const;
export type CollectibleMaterial=typeof MATERIAL_IDS[number];
export const SERIES_IDS=['classic','aura','animation'] as const;
export type CollectibleSeries=typeof SERIES_IDS[number];
export interface CollectiblePool {materials:ReadonlyArray<{id:CollectibleMaterial;weight:number}>;series:ReadonlyArray<{id:CollectibleSeries;weight:number}>}
export function materialTier(material:CollectibleMaterial):Tier{return material==='gold'?'gold':material==='prism'?'prism':material==='oilslick'?'obsidian':'silver';}
function pick<T extends string>(items:ReadonlyArray<{id:T;weight:number}>,hex:string):T{
 const total=items.reduce((n,item)=>n+item.weight,0);let bucket=BigInt('0x'+hex)*BigInt(total)/(1n<<128n);
 for(const item of items){if(bucket<BigInt(item.weight))return item.id;bucket-=BigInt(item.weight);}throw Error('invalid collectible pool');
}
/** Disjoint halves of a server HMAC: independent 128-bit material and series samples. */
export function drawCollectible(pool:CollectiblePool,seed:string){
 const material=pick(MATERIAL_IDS.map(id=>pool.materials.find(m=>m.id===id)!),seed.slice(0,32));
 const series=pick(SERIES_IDS.map(id=>pool.series.find(s=>s.id===id)!),seed.slice(32));
 return {material,series,tier:materialTier(material)};
}
