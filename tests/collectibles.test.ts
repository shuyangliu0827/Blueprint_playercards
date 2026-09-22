import {it,expect} from 'vitest';
import config from '../config/rarity_v1.json';
import {draw} from '../src/core/draw';
import {MATERIAL_IDS} from '../src/core/collectibles';
const half=(i:number,n:number)=>((BigInt(i)*(1n<<128n)+BigInt(n)-1n)/BigInt(n)).toString(16).padStart(32,'0');
it('covers every equal-weight material and independently enforces 98/1/1 series buckets',()=>{
 const counts={classic:0,aura:0,animation:0};
 for(let m=0;m<14;m++)for(let s=0;s<100;s++){
  const seed=half(m,14)+half(s,100),result=draw(config,seed,false);
  expect(result.material).toBe(MATERIAL_IDS[m]);expect(result.series).toBe(s<98?'classic':s===98?'aura':'animation');
  expect(draw(config,seed,true)).toEqual(result);counts[result.series!]++;
 }
 expect(counts).toEqual({classic:1372,aura:14,animation:14});
});
it('rejects modified or incomplete probability pools',()=>{
 const modified=structuredClone(config);modified.collectibles.series[1]!.weight=2;
 expect(()=>draw(modified,'0'.repeat(64),false)).toThrow();
});
