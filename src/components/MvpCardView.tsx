'use client';
import {useEffect,useRef,useState} from 'react';
import {createHoloCard,type HoloCard} from '@kongyo2/cards-css';
import type {Tier} from '../render/types';
import type {CardSeries} from '../render/mvp-card';
import {CARD_MATERIALS,materialForCard,strongFoilVisual,foilVariables,type CardMaterial} from '../render/cards-css';
import {mountCardMotion} from '../platform/card-motion';
import {bindOrientation} from '../platform/web';
import styles from './MvpCardView.module.css';
export type MvpCardViewProps={front:string;back?:string;tier:Tier;series?:CardSeries;interactive?:boolean;forceStatic?:boolean;material?:CardMaterial;strength?:number;};
export default function MvpCardView({front,back,tier,series='classic',interactive=true,forceStatic=false,material,strength=1.6}:MvpCardViewProps){
 const mount=useRef<HTMLDivElement>(null),engine=useRef<HoloCard|null>(null);
 const motion=useRef<ReturnType<typeof mountCardMotion>|null>(null);
 const sensorCleanup=useRef<(()=>void)|null>(null);
 const [chosen,setChosen]=useState<CardMaterial|null>(null),[power,setPower]=useState(strength);
 const [flipped,setFlipped]=useState(false),[reduced,setReduced]=useState(false),[motionPaused,setMotionPaused]=useState(false),[sensor,setSensor]=useState('');
 const recipe=material??chosen??materialForCard(tier,series);const still=forceStatic||reduced||!interactive;
 useEffect(()=>{setPower(strength);},[strength]);
 useEffect(()=>{setFlipped(false);setChosen(null);},[front,tier,series]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReduced(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
 useEffect(()=>{
  const parent=mount.current;if(!parent)return;
  const card=createHoloCard({image:flipped&&back?back:front,imageAlt:flipped?'篮球卡背面':'篮球卡正面',
   effect:flipped?'none':recipe,aspectRatio:5/7,textureSeed:777,interactive:!still,gyroscope:false,activateOnClick:false,showcase:false,
   physics:{maxTilt:16,parallax:1.4,glareRange:1.15},visual:strongFoilVisual(power),
   className:'bp-full-foil',vars:{'--card-radius':'14px'}});
  card.element.dataset.material=recipe;card.element.dataset.flipped=String(flipped);card.element.dataset.still=String(still);
  // Keep the foil visible at rest, rather than fading the entire material to zero.
  card.setVars({...foilVariables(.3,-.25),'--card-opacity':1});
  parent.replaceChildren(card.element);engine.current=card;
  if(series!=='classic'&&!flipped&&card.front){const canvas=document.createElement('canvas');canvas.width=600;canvas.height=840;canvas.className=styles.foil!;canvas.setAttribute('aria-label',series==='aura'?'AURA 天体光晕动画':'ANIMATION 漫画传送门动画');card.front.append(canvas);motion.current=mountCardMotion(card.element,canvas,{series,tier,material:false,tilt:false,playing:!still&&!motionPaused});}
  return()=>{sensorCleanup.current?.();sensorCleanup.current=null;motion.current?.destroy();motion.current=null;card.destroy();card.element.remove();engine.current=null;};
 // Visual controls are updated without rebuilding textures or resetting interaction.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[front,back,recipe,flipped,still,series,tier]);
 useEffect(()=>{engine.current?.setVisual(strongFoilVisual(power));},[power,recipe,still,flipped]);
 useEffect(()=>{motion.current?.setPlaying(!still&&!motionPaused);},[still,motionPaused,recipe,flipped]);
 async function enableSensor(){try{sensorCleanup.current?.();sensorCleanup.current=await bindOrientation(v=>{if(v.source!=='orientation')return;const x=Math.max(-1,Math.min(1,v.rollDeg/30)),y=Math.max(-1,Math.min(1,v.pitchDeg/30));engine.current?.setVars({...foilVariables(x,y),'--card-opacity':1,'--rotate-x':`${x*16}deg`,'--rotate-y':`${-y*16}deg`});});setSensor('倾斜感应已开启');}catch{setSensor('此设备可用指针或触摸查看反光');}}
 return <div className={styles.wrapper}>
  <div ref={mount} className="bp-holo-mount" data-series={series} data-tier={tier}/>
  {interactive&&<div className={styles.controls}>
   {!material&&<label className="bp-material-picker">卡面材质 <select aria-label="卡面材质" value={recipe} onChange={e=>setChosen(e.target.value as CardMaterial)}>{Object.entries(CARD_MATERIALS).map(([id,entry])=><option key={id} value={id}>{entry.label}</option>)}</select></label>}
   {!material&&<label className="bp-material-picker">强度 {Math.round(power*100)}% <input aria-label="材质强度" type="range" min="0.5" max="2.5" step="0.1" value={power} onChange={e=>setPower(Number(e.target.value))}/></label>}
   {back&&<button type="button" onClick={()=>setFlipped(v=>!v)}>↻ {flipped?'查看正面':'翻到卡背'}</button>}
   {!still&&recipe!=='none'&&!flipped&&<button type="button" onClick={enableSensor}>◇ 开启倾斜感应</button>}
   {series!=='classic'&&!still&&!flipped&&<button type="button" aria-pressed={motionPaused} onClick={()=>setMotionPaused(v=>!v)}>{motionPaused?'▶ 播放特卡动画':'Ⅱ 暂停特卡动画'}</button>}
   {recipe!=='none'&&<span role="status">{still?'静态反光模式':sensor||'移动指针或轻拖卡面，查看材质反光'}</span>}
  </div>}
 </div>;
}
