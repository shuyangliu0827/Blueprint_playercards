'use client';
import {useEffect,useState,type CSSProperties,type ReactNode} from 'react';
const defaults={colorOpacity:.656,brightness:.96,contrast:.5,saturation:2.25,colorBlend:'color-dodge',glareOpacity:.41,glarePeak:.56,glareWidth:74,glareAngle:119,glareTravel:100,glareBlend:'hard-light'};
type Tune=typeof defaults;
const storageKey='blueprint-foil-tune-v1';
const blends=['soft-light','screen','overlay','color-dodge','normal','hard-light'];
export default function FoilTuner({children}:{children:ReactNode}){
 const [tune,setTune]=useState<Tune>(defaults),[ready,setReady]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved){const next={...defaults};for(const k of Object.keys(defaults) as (keyof Tune)[]){if(typeof saved[k]===typeof defaults[k])Object.assign(next,{[k]:saved[k]});}setTune(next);}}catch{}setReady(true);},[]);
 useEffect(()=>{if(ready)try{localStorage.setItem(storageKey,JSON.stringify(tune));}catch{}},[tune,ready]);
 function range(key:keyof Tune,label:string,min:number,max:number,step:number){return <label className="foil-tune-field">{label}<output>{Number(tune[key]).toFixed(step<.1?2:0)}</output><input aria-label={label} type="range" min={min} max={max} step={step} value={tune[key]} onChange={e=>setTune(v=>({...v,[key]:Number(e.target.value)}))}/></label>;}
 function blend(key:'colorBlend'|'glareBlend',label:string){return <label className="foil-tune-field">{label}<select aria-label={label} value={tune[key]} onChange={e=>setTune(v=>({...v,[key]:e.target.value}))}>{blends.map(b=><option key={b} value={b}>{({'soft-light':'柔光',screen:'滤色（提亮）',overlay:'叠加','color-dodge':'颜色减淡（强反光）',normal:'普通','hard-light':'强光'})[b]}</option>)}</select></label>;}
 const half=tune.glareWidth/2;
 const style={
 '--bp-shine-opacity':tune.colorOpacity,'--bp-shine-blend':tune.colorBlend,
 '--bp-shine-filter':`brightness(${tune.brightness}) contrast(${tune.contrast}) saturate(${tune.saturation})`,
 '--bp-glare-opacity':tune.glareOpacity,'--bp-glare-blend':tune.glareBlend,
 '--bp-glare-travel':`${tune.glareTravel}%`,
 '--bp-glare-image':`linear-gradient(calc(${tune.glareAngle}deg + var(--pointer-dx) * 12deg), rgba(255,255,255,0) ${50-half}%,rgba(255,255,255,${tune.glarePeak*.3}) ${50-half*.45}%,rgba(255,255,255,${tune.glarePeak}) 50%,rgba(255,255,255,${tune.glarePeak*.3}) ${50+half*.45}%,rgba(255,255,255,0) ${50+half}%)`,
 } as CSSProperties;
 const json=JSON.stringify({version:1,...tune},null,2);
 return <div className="foil-tuning-layout">
 <aside className="foil-tune-panel"><h2>材质调试</h2><p>实时作用于下方全部材质。参数自动保存在此浏览器；调好后复制给我。</p>
 <fieldset><legend>彩色材质</legend>{range('colorOpacity','彩色透明度',0,1,.01)}{range('brightness','彩色亮度',.2,3,.01)}{range('contrast','彩色对比度',.2,3,.01)}{range('saturation','彩色饱和度',0,5,.01)}{blend('colorBlend','彩色混合方式')}</fieldset>
 <fieldset><legend>白色反光带</legend>{range('glareOpacity','白光透明度',0,1,.01)}{range('glarePeak','白光峰值',0,1,.01)}{range('glareWidth','光带宽度',10,100,1)}{range('glareAngle','光带角度',0,180,1)}{range('glareTravel','光带移动幅度',0,100,1)}{blend('glareBlend','白光混合方式')}</fieldset>
 <p>透明度调到 0 可单独关闭该层，对比效果。</p><div className="foil-tune-actions"><button onClick={async()=>{try{await navigator.clipboard.writeText(json);setMessage('参数已复制，可以粘贴到对话里');}catch{setMessage('请选中下方参数手动复制');}}}>复制参数</button><button onClick={()=>{setTune({...defaults});setMessage('已恢复默认参数');}}>恢复默认</button></div><p role="status">{message}</p><details><summary>查看参数</summary><textarea aria-label="材质参数" value={json} readOnly rows={15}/></details></aside>
 <div className="bp-foil-tuning" style={style}>{children}</div></div>;
}
