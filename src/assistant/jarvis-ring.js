/* Adapted from yesterday's Jarvis VoiceRing; same filament and ripple geometry, neutral silver colours. */
window.createJarvisRing=function(canvas,getPhase,getMotion){const c=canvas,ctx=c.getContext('2d');if(!ctx)return;let frame=0,last=0,clock=0,energy=0,speakMix=0;const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
 function draw(now){frame=requestAnimationFrame(draw);if(document.hidden||now-last<30)return;const dt=Math.min((now-last)/1000,.06);last=now;const size=c.clientWidth,dpr=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(size*dpr)){c.width=Math.round(size*dpr);c.height=c.width;}const context=ctx;const m=getMotion(),phase=getPhase();const talking=phase==='speaking',listening=phase==='listening';const inputEvent=Math.exp(-(now-m.inputPulse)/430);const outputEvent=Math.exp(-(now-m.outputPulse)/240);
 // Safari exposes speech events, not raw levels alongside SpeechRecognition.
 // Prefer real levels where available; TTS uses boundaries + an organic envelope.
 const vocalEnvelope=.25+.4*Math.pow(Math.sin(now*.007)*Math.sin(now*.011+1.7),2);
 const input=Math.max(m.input,m.speech?.27+.12*Math.sin(now*.009):0,inputEvent*.7);
 const spoken=m.measuredOutput?m.output:Math.max(outputEvent*.9,vocalEnvelope);
 const target=talking?spoken:listening?input:phase==='thinking'?.16:.025;
 energy+=(target-energy)*(1-Math.exp(-dt*(target>energy?16:5)));speakMix+=((talking?1:0)-speakMix)*(1-Math.exp(-dt*3));clock+=dt*(.32+energy*.8+speakMix*.5);const t=reduced?0:clock,amp=reduced?energy*.15:energy;
 context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,size,size);context.save();context.translate(size/2,size/2);context.globalCompositeOperation='lighter';
 const radius=size*(.316+Math.sin(t*1.4)*.005+amp*.022);const halo=context.createRadialGradient(0,0,radius*.74,0,0,radius*1.38);halo.addColorStop(0,'rgba(180,180,182,0)');halo.addColorStop(.48,`rgba(204,204,206,${.015+amp*.07})`);halo.addColorStop(1,'rgba(180,180,182,0)');context.fillStyle=halo;context.fillRect(-size/2,-size/2,size,size);
 // Coherent, overlapping filaments create an ink membrane, rather than bars.
 // While speaking, a few membrane paths are remembered so short orange arcs can be traced along them afterwards.
 const accent=speakMix>.01?[]:null;
 for(let band=0;band<72;band++){const b=band/71;const pts=accent&&band%9===4?[]:null;context.beginPath();for(let p=0;p<=200;p++){const a=p/200*Math.PI*2;const twist=t*(.3+speakMix*.6);const turbulence=Math.sin(a*3+twist+b*2.2)*.52+Math.sin(a*5-t*.8+b*3.5)*.25+Math.sin(a*9+t*1.3+b*5)*.14;const fold=Math.sin(a*13-t*1.4+b*6)*Math.sin(a*4+t*.8)*.007;const plume=Math.pow(.5+.5*Math.sin(a*3-t*.42),3);const wave=Math.sin(a*4-t*3+b*2)*amp*(.022+speakMix*.012);const rr=radius+size*(turbulence*(.029+amp*.053)+(b-.5)*(.028+plume*(.079+amp*.03))+fold+wave);const angle=a+Math.sin(a*3+t+b)*(.017+amp*.028);const x=Math.cos(angle)*rr,y=Math.sin(angle)*rr;if(pts)pts.push(x,y);if(!p)context.moveTo(x,y);else context.lineTo(x,y);}context.closePath();
 context.strokeStyle=`rgba(${talking?'238,238,240':'226,226,228'},${.027+Math.sin(b*Math.PI)*(.08+amp*.11)})`;context.lineWidth=.4+Math.sin(b*Math.PI)*.35;context.stroke();if(pts)accent.push({pts,b});}
 // Speaking accent (#e0874d): short thin arcs that run along those same membrane paths, painted normally (not additively)
 // so they read as orange over the silver. Eased in and out with speakMix and the output pulse; no new shapes.
 if(accent){context.globalCompositeOperation='source-over';const strength=speakMix*Math.min(1,.5+amp*1.1+outputEvent*.5);
  accent.forEach((f,i)=>{for(let w=0;w<2;w++){const center=(t*.045+i*.137+w*.5)%1,span=.07+.03*Math.sin(t*.7+i),first=Math.floor(((center-span/2)%1+1)%1*200),count=Math.max(2,Math.floor(span*200));
   context.beginPath();for(let s=0;s<=count;s++){const idx=(first+s)%201;if(!s)context.moveTo(f.pts[idx*2],f.pts[idx*2+1]);else context.lineTo(f.pts[idx*2],f.pts[idx*2+1]);}
   context.strokeStyle=`rgba(224,135,77,${(.3+.45*Math.sin(f.b*Math.PI))*strength})`;context.lineWidth=.75;context.stroke();}});
  context.globalCompositeOperation='lighter';}
 // Jarvis sends broad, expanding ripples out through the membrane.
 if(speakMix>.01&&!reduced)for(let n=0;n<3;n++){const progress=(t*.62+n/3)%1;context.beginPath();for(let p=0;p<=150;p++){const a=p/150*Math.PI*2;const rr=radius+size*(progress*.105+Math.sin(a*5-t*2)*.008);const x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(!p)context.moveTo(x,y);else context.lineTo(x,y);}context.strokeStyle=`rgba(214,214,218,${(1-progress)**2*speakMix*(.09+amp*.12)})`;context.lineWidth=.8;context.stroke();}
 for(let k=0;k<160;k++){const a=k*2.39996+t*(.035+speakMix*.08);const spread=Math.abs(Math.sin(k*73.1)*Math.cos(k*13.3));const rr=radius+size*(.026+spread*.11+Math.sin(t+k)*.007+amp*.02);context.beginPath();context.arc(Math.cos(a)*rr,Math.sin(a)*rr,.3+(k%4)*.19,0,Math.PI*2);const spark=k%11===0?speakMix:0;context.fillStyle=`rgba(${spark>.01?[226,226,230].map((v,i)=>Math.round(v+([224,135,77][i]-v)*spark)).join(','):'226,226,230'},${(.04+(1-spread)*.14)*(1+amp)})`;context.fill();}context.restore();}
 frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
};
