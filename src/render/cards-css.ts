import type { Tier } from './types';
import type { CardSeries } from './mvp-card';
import type { HoloEffect, VisualOptions } from '@kongyo2/cards-css';
export const CARD_MATERIALS = {
 none:{label:'光面'}, holo:{label:'全息'}, reverse:{label:'逆向全息'}, cosmos:{label:'银河'},
 glitter:{label:'闪粉'}, aurora:{label:'极光'}, rainbow:{label:'彩虹'}, gold:{label:'金色秘闪'},
 prism:{label:'棱镜'}, radiant:{label:'放射纹'}, crystal:{label:'水晶'}, metal:{label:'金属'},
 oilslick:{label:'油膜'}, sunburst:{label:'日芒'}, mosaic:{label:'马赛克'},
} as const satisfies Record<HoloEffect,{label:string}>;
export type CardMaterial = HoloEffect;
export function materialForCard(tier:Tier,series:CardSeries):CardMaterial {
 if(tier==='base')return 'none';if(tier==='gold')return 'gold';if(tier==='obsidian')return 'oilslick';
 if(tier==='prism')return 'prism';return series==='aura'?'cosmos':'holo';
}
export function strongFoilVisual(strength=1.6):VisualOptions {
 const n=Number.isFinite(strength)?Math.max(.5,Math.min(2.5,strength)):1.6;
 return {brightness:.96,contrast:.5,saturate:1.85+n*.25,shineOpacity:.4+n*.16,glareOpacity:.1,imageFit:'cover'};
}
export function foilVariables(x:number,y:number):Record<string,string> {
  x=Number.isFinite(x)?Math.max(-1,Math.min(1,x)):0;
  y=Number.isFinite(y)?Math.max(-1,Math.min(1,y)):0;
  return {'--pointer-x':`${(x+1)*50}%`,'--pointer-y':`${(y+1)*50}%`,
    '--background-x':`${50+x*10}%`,'--background-y':`${50+y*15}%`,
    '--pointer-from-left':String((x+1)/2),'--pointer-from-top':String((y+1)/2),
    '--pointer-from-center':String(Math.min(1,Math.hypot(x,y))), '--card-opacity':'0.75'};
}
export function applyFoilPointer(host:HTMLElement,x:number,y:number) {
  for(const [key,value] of Object.entries(foilVariables(x,y)))host.style.setProperty(key,value);
}
