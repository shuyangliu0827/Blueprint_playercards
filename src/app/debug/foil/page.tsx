'use client';
import {useEffect,useState} from 'react';
import FoilTuner from '../../../components/FoilTuner';
import MvpCardView from '../../../components/MvpCardView';
import {CARD_MATERIALS,type CardMaterial} from '../../../render/cards-css';
import {renderMvpCard} from '../../../render/mvp-card';
import {loadImage} from '../../../platform/web';
export default function FoilPreview(){
 const [front,setFront]=useState('');const [error,setError]=useState('');
 useEffect(()=>{let disposed=false;loadImage('/assets/mvp/demo-photo.jpg').then(artwork=>renderMvpCard({artwork,tier:'silver',series:'classic',data:{nickname:'AIR TIME',jerseyNumber:'08',position:'',handedness:'',cardId:'MATERIAL PREVIEW',aiLabel:'照片示例',tierName:'',story:'',seriesName:'',issuedAt:''}})).then(card=>{if(!disposed)setFront(card.toDataURL());}).catch(e=>{if(!disposed)setError(String(e));});return()=>{disposed=true;};},[]);
 return <main style={{background:'#101218',color:'#f4f1e9',minHeight:'100vh',padding:'40px 6vw'}}>
 <a href="/" style={{color:'#c6ad78'}}>← 返回蓝本</a><h1 style={{fontSize:32,margin:'24px 0 12px'}}>同一张球星卡，14 种收藏卡材质</h1>
 <p style={{color:'#a6a9b1',lineHeight:1.8}}>移动指针或轻拖卡面，查看不同角度的反光。照片与版式保持一致；另有光面对照。</p>
 {error&&<p role="alert">{error}</p>}
 <FoilTuner>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:36,maxWidth:1200,margin:'32px auto'}}>
 {(Object.entries(CARD_MATERIALS) as [CardMaterial,(typeof CARD_MATERIALS)[CardMaterial]][]).map(([material,info])=><section key={material}><h2 style={{fontSize:17,marginBottom:16}}>{info.label} <small style={{color:"#a1a2b5",fontSize:11}}>{material.toUpperCase()}</small></h2>{front?<MvpCardView front={front} back={front} tier={material==='none'?'base':'silver'} material={material} strength={1.6}/>:<p>正在准备卡面…</p>}</section>)}
 </div></FoilTuner><p style={{fontSize:12,color:'#8b909c'}}>材质源自 <a href="https://github.com/kongyo2/cards-css" style={{color:'inherit'}}>kongyo2 · cards-css</a>（MIT）。这是网页动态材质预览。</p></main>;
}
