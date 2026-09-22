import {createHoloCard} from '@kongyo2/cards-css';
import {toCanvas} from 'html-to-image';
import {strongFoilVisual,foilVariables,type CardMaterial} from './cards-css';
/** Snapshot the same CSS engine and approved recipe used by the live card. */
export async function exportFoilCard(front:HTMLCanvasElement,material:CardMaterial):Promise<HTMLCanvasElement>{
 const card=createHoloCard({image:front.toDataURL(),effect:material,aspectRatio:5/7,textureSeed:777,interactive:false,showcase:false,activateOnClick:false,visual:strongFoilVisual(),className:'bp-full-foil'});
 const host=document.createElement('div');host.style.cssText='position:fixed;left:-12000px;top:0;width:1000px;height:1400px;pointer-events:none;';
 card.element.style.width='1000px';card.element.style.height='1400px';card.element.dataset.material=material;
 card.setVars({...foilVariables(0,0),'--pointer-dx':0,'--pointer-dy':0,'--card-opacity':1,'--rotate-x':'0deg','--rotate-y':'0deg'});
 host.append(card.element);document.body.append(host);
 try{
  await Promise.all([...card.element.querySelectorAll('img')].map(img=>{img.loading="eager";return img.decode();}));
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  return await toCanvas(card.element,{width:1000,height:1400,pixelRatio:1,skipFonts:true,style:{transform:'none',margin:'0',boxShadow:'none'}});
 }finally{card.destroy();host.remove();}
}
