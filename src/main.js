import './styles.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import {get,set} from 'idb-keyval';
import * as XLSX from 'xlsx';
import {jsPDF} from 'jspdf';
import {sb,getUser,login,signup,logout,pull,push,entrarEmpresa,listaEquipe,criarConvite,aceitarConvite,remover} from './sync.js';

const brl=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const CATS=['Material','Mão de obra','Transporte','Outros'];
const hoje=()=>new Date().toISOString().slice(0,10);
const fd=d=>new Date(d+'T12:00').toLocaleDateString('pt-BR');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const seed=()=>({modelo:['Fotografar antes de começar','Conferir medidas','Vistoria final'],obras:[]});
let S=(await get('obras'))||seed();
let user=null,ready=false,tm,emp=null,papel=null,eq=null;
const inviteStorageKey='obras-convite-pendente';
const inviteFromUrl=new URLSearchParams(location.search).get('convite');
if(inviteFromUrl)localStorage.setItem(inviteStorageKey,inviteFromUrl);
let inviteLink=null;
const queuePush=()=>{if(!sb||!ready)return;clearTimeout(tm);tm=setTimeout(()=>push(S,emp).catch(()=>{}),1500)};
const save=()=>{set('obras',S).catch(()=>alert('Não foi possível salvar os dados neste aparelho.'));queuePush()};
async function sync0(){
 try{const r=await entrarEmpresa();emp=r.emp;papel=r.pap;const c=await pull();
  const obras=new Map(c.obras.map(o=>[String(o.id),o]));
  S.obras.forEach(o=>obras.set(String(o.id),o));
  S.obras=[...obras.values()];
  if(c.modelo?.length)S.modelo=c.modelo;
  await set('obras',S);
  ready=true;await push(S,emp)}catch(e){ready=false}
}
async function finishInvite(){
 const token=localStorage.getItem(inviteStorageKey);
 if(!token)return;
 await aceitarConvite(token);
 localStorage.removeItem(inviteStorageKey);
 const url=new URL(location.href);url.searchParams.delete('convite');
 history.replaceState({},'',url);
}
async function auth(a){
 const em=document.getElementById('em').value.trim(),pw=document.getElementById('pw').value;
 if(!em||pw.length<6){alert('Digite o e-mail e uma senha de pelo menos 6 caracteres.');return}
 const r=await (a==='login'?login:signup)(em,pw);
 if(r.error){alert(r.error.message);return}
 user=r.data.session?.user;if(!user){alert('Conta criada. Confirme o e-mail que você recebeu e depois entre.');return}
 try{await finishInvite();await sync0();render()}
 catch(e){alert('Não foi possível aceitar o convite: '+e.message)}
}
const carregaEq=()=>listaEquipe().then(l=>{eq=l;render()}).catch(e=>alert('Não foi possível carregar a equipe: '+e.message));
const equipeV=()=>`<div class="top"><button class="ghost" data-a="eqback">← Obras</button></div><h1>Equipe</h1><p class="mut">Quem está aqui vê todas as obras. Gere um link e envie diretamente para a pessoa. O link pode ser usado uma vez e expira em 7 dias; quem abrir primeiro poderá entrar na equipe.</p>${eq.map(m=>`<div class="card"><div class="row" style="justify-content:space-between"><span>${esc(m.email)} <span class="tag">${m.papel}</span></span>${m.papel==='admin'?'':`<button class="sm ghost" data-a="eqdel" data-e="${esc(m.email)}">Remover</button>`}</div></div>`).join('')}${papel==='admin'?`<div class="form" style="margin-top:16px"><button class="fill full" data-a="invite">Gerar link de convite</button>${inviteLink?`<input class="full" id="invite-link" readonly value="${esc(inviteLink)}"><button class="ghost full" data-a="copy-invite">Copiar link</button>`:''}</div>`:''}`;
const entrar=()=>`<div class="top"><h1>Obras</h1></div>${localStorage.getItem(inviteStorageKey)?'<p class="mut">Você recebeu um convite para entrar em uma equipe. Entre ou crie sua conta usando seu próprio e-mail.</p>':'<p class="mut">Entre para sincronizar seus dados em todos os aparelhos.</p>'}<div class="form"><input class="full" id="em" type="email" placeholder="E-mail" autocomplete="email"><input class="full" id="pw" type="password" placeholder="Senha (mín. 6 caracteres)" autocomplete="current-password"><button class="fill" data-a="login">Entrar</button><button class="ghost" data-a="signup">Criar conta</button></div>`;
let cur=null,tab='gastos',F={q:'',c:'',m:''},tmp=null,tmpD=[];
const tot=o=>o.gastos.reduce((a,g)=>a+g.v,0);
const pend=o=>o.gastos.filter(g=>!g.pago);
const ST=['Em andamento','Pausada','Concluída'];

function monthChart(o){
 const m={};o.gastos.forEach(g=>{const k=g.date.slice(0,7);m[k]=(m[k]||0)+g.v});
 const ks=Object.keys(m).sort();if(!ks.length)return'<p class="mut">Sem gastos ainda.</p>';
 const max=Math.max(...ks.map(k=>m[k])),w=Math.max(300,ks.length*70);
 return `<div class="scroll"><svg viewBox="0 0 ${w} 148" width="100%" style="min-width:${w}px;color:var(--ink)" role="img" aria-label="Gastos por mês">${ks.map((k,i)=>{const h=Math.round(m[k]/max*100),x=i*70+14;return `<rect x="${x}" y="${120-h}" width="44" height="${h}" fill="currentColor"/><text x="${x+22}" y="${116-h}" text-anchor="middle" font-size="14">${Math.round(m[k]).toLocaleString('pt-BR')}</text><text x="${x+22}" y="140" text-anchor="middle" font-size="15">${new Date(k+'-15').toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</text>`}).join('')}<line x1="0" x2="${w}" y1="120" y2="120" stroke="currentColor" stroke-width="2"/></svg></div>`}
function bars(o,key){
 const m={};o.gastos.forEach(g=>{const k=g[key]||'—';m[k]=(m[k]||0)+g.v});const max=Math.max(1,...Object.values(m));
 return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="bar"><span>${esc(c)}</span><div class="track"><i style="width:${v/max*100}%"></i></div><b class="num" style="font-size:20px">${brl(v)}</b></div>`).join('')||'<p class="mut">Sem gastos ainda.</p>'}

function lista(o){
 const q=F.q.toLowerCase();
 const r=o.gastos.map((g,i)=>({g,i})).filter(({g})=>(!F.c||g.cat===F.c)&&(!F.m||g.date.slice(0,7)===F.m)&&(!q||(g.desc+' '+(g.quem||'')).toLowerCase().includes(q))).reverse();
 const s=r.reduce((a,x)=>a+x.g.v,0);
 return `<p class="mut">${r.length} lançamento(s) · ${brl(s)}</p>`+(r.map(({g,i})=>{
  const late=!g.pago&&g.venc&&g.venc<hoje();
  return `<div class="g"><div><div>${esc(g.desc)} ${g.pago?'':`<span class="tag ${late?'late':''}">${late?'Vencido':'A pagar'} ${g.venc?fd(g.venc):''}</span>`}</div>
  <div class="mut">${g.cat}${g.quem?' · '+esc(g.quem):''} · ${fd(g.date)}</div>
  ${g.foto?`<img src="${g.foto}" alt="Nota" style="width:64px;height:64px;object-fit:cover;border:2px solid var(--ink);margin-top:6px">`:''}
  <div class="row noprint" style="margin-top:6px">${g.pago?'':`<button class="sm fill" data-a="pagar" data-i="${i}">Marcar pago</button>`}<button class="sm ghost" data-a="editg" data-i="${i}">Editar</button><button class="sm ghost" data-a="delg" data-i="${i}">Apagar</button></div></div>
  <b class="num" style="font-size:22px">${brl(g.v)}</b></div>`}).join('')||'<p class="mut">Nenhum lançamento encontrado.</p>')}

const D=o=>o.diario||(o.diario=[]);
const CLIMA=['Sol','Nublado','Chuva'];
function dlista(o){const q=(F.dq||'').toLowerCase();
 const r=D(o).map((r,i)=>({r,i})).filter(({r})=>!q||((r.servicos||'')+' '+(r.ocorr||'')+' '+(r.equipe||'')).toLowerCase().includes(q)).sort((a,b)=>b.r.date.localeCompare(a.r.date));
 return r.map(({r,i})=>`<div class="dia"><div class="row" style="justify-content:space-between"><b class="num" style="font-size:24px">${fd(r.date)}</b><span class="tag">${r.clima}</span></div>
 ${r.equipe?`<div class="mut">Equipe: ${esc(r.equipe)}</div>`:''}
 ${r.servicos?`<p style="margin:8px 0;white-space:pre-wrap">${esc(r.servicos)}</p>`:''}
 ${r.ocorr?`<p style="margin:8px 0;white-space:pre-wrap"><b>Ocorrência:</b> ${esc(r.ocorr)}</p>`:''}
 ${r.fotos.length?`<div class="thumbs">${r.fotos.map((f,j)=>`<figure data-a="dnota" data-i="${i}" data-j="${j}"><img src="${f.src}" alt="Foto do dia"><figcaption>${f.nota?esc(f.nota):'Toque para comentar'}</figcaption></figure>`).join('')}</div>`:''}
 <div class="row noprint"><button class="sm ghost" data-a="editd" data-i="${i}">Editar</button><button class="sm ghost" data-a="deld" data-i="${i}">Apagar</button></div></div>`).join('')||'<p class="mut">Nenhum registro ainda. Preencha acima para começar o diário.</p>'}
function diario(o){return `<div class="form noprint"><input id="dd" type="date" value="${hoje()}"><select id="dc">${CLIMA.map(c=>`<option>${c}</option>`).join('')}</select>
 <input class="full" id="de" placeholder="Quem trabalhou hoje? (nomes ou quantidade)"><textarea class="full" id="ds" placeholder="O que foi feito hoje"></textarea>
 <textarea class="full" id="do" placeholder="Ocorrências (problema, falta de material, atraso). Opcional" style="min-height:60px"></textarea>
 <label class="cam full" style="justify-content:flex-start;height:46px" id="dfl">📷 Anexar fotos do dia<input id="df" type="file" accept="image/*" multiple></label>
 <button class="fill full" data-a="adddia">Salvar registro</button></div><div class="row noprint" style="margin:12px 0"><button class="sm ghost" data-a="pdfdiario">Baixar PDF do diario</button></div>
 <h2>Registros</h2><input data-f="dq" placeholder="Buscar nos registros" value="${esc(F.dq||'')}" style="margin-bottom:8px"><div id="dlista">${dlista(o)}</div>`}

function home(){
 const all=S.obras.reduce((a,o)=>a+tot(o),0),lim=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
 const al=S.obras.flatMap(o=>pend(o).filter(g=>g.venc&&g.venc<=lim).map(g=>({o,g})));
 return `<div class="top"><h1>Obras</h1><button class="ghost sm" data-a="theme" aria-label="Alternar tema">◐</button></div>
 <p class="mut" style="margin:0">Total gasto em todas as obras</p><div class="num big">${brl(all)}</div>
 ${al.length?`<div class="alert"><b>Contas para pagar</b>${al.map(({o,g})=>`<div>${g.venc<hoje()?'Vencido':'Vence'} ${fd(g.venc)}: ${esc(g.desc)} (${esc(o.nome)}) — <b>${brl(g.v)}</b></div>`).join('')}</div>`:''}
 <h2>Suas obras</h2>
 ${S.obras.map(o=>{const d=o.checklist.filter(c=>c.done).length;return `<button class="card" data-a="open" data-id="${o.id}"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(o.nome)}</h2><span class="tag">${o.status}</span></div><div class="num">${brl(tot(o))}${o.orc?` <span class="mut" style="font-family:Barlow">de ${brl(o.orc)}</span>`:''}</div><div class="mut">Checklist: ${d} de ${o.checklist.length} · A pagar: ${brl(pend(o).reduce((a,g)=>a+g.v,0))}</div></button>`}).join('')||'<p class="mut">Nenhuma obra ainda. Digite o nome abaixo para criar a primeira.</p>'}
 <div class="row add-row" style="margin-top:16px"><input id="nova" placeholder="Nome da nova obra"><button class="fill" data-a="addobra">Adicionar obra</button></div>
 <div class="row noprint" style="margin-top:28px"><button class="sm ghost" data-a="backup">Baixar backup</button><label class="cam" style="height:38px;font-size:15px;font-weight:600">Restaurar backup<input id="rest" type="file" accept="application/json"></label>${papel==='admin'?'<button class="sm ghost" data-a="equipe">Equipe</button>':''}${sb?'<button class="sm ghost" data-a="logout">Sair</button>':''}</div>`}

function obra(){
 const o=S.obras.find(x=>x.id===cur),t=tot(o);
 const tabs=[['gastos','Gastos'],['check','Checklist'],['diario','Diário'],['graf','Gráficos']].map(([k,l])=>`<button role="tab" aria-selected="${tab===k}" data-a="tab" data-k="${k}">${l}</button>`).join('');
 const ms=[...new Set(o.gastos.map(g=>g.date.slice(0,7)))].sort();
 let b='';
 if(tab==='gastos')b=`<div class="form noprint"><input class="full" id="gd" placeholder="O que foi pago?"><input id="gv" type="number" inputmode="decimal" placeholder="Valor em R$"><select id="gc">${CATS.map(c=>`<option>${c}</option>`).join('')}</select>
 <input id="gq" list="forn" placeholder="Pago a quem? (fornecedor)"><datalist id="forn">${[...new Set(S.obras.flatMap(x=>x.gastos.map(g=>g.quem)).filter(Boolean))].map(f=>`<option value="${esc(f)}">`).join('')}</datalist>
 <label class="mut">Vence em (deixe vazio se já pagou)<input id="gvc" type="date"></label>
 <label class="cam full" style="justify-content:flex-start;height:46px" id="gfl">📷 Anexar foto da nota<input id="gf" type="file" accept="image/*"></label>
 <button class="fill full" data-a="addgasto">Lançar gasto</button></div>
 <h2>Lançamentos</h2><div class="form filters noprint"><input data-f="q" placeholder="Buscar" value="${esc(F.q)}"><select data-f="c"><option value="">Categoria</option>${CATS.map(c=>`<option ${F.c===c?'selected':''}>${c}</option>`).join('')}</select><select data-f="m"><option value="">Mês</option>${ms.map(m=>`<option value="${m}" ${F.m===m?'selected':''}>${m.slice(5)}/${m.slice(2,4)}</option>`).join('')}</select></div><div id="lista">${lista(o)}</div>`;
 if(tab==='check')b=`<div class="row noprint" style="margin-top:12px"><input id="ci" placeholder="Novo item" style="flex:1"><button class="fill" data-a="addcheck">Adicionar</button></div>
 <div class="row noprint" style="margin:10px 0"><button class="sm ghost" data-a="usamodelo">Aplicar modelo</button><button class="sm ghost" data-a="salvamodelo">Salvar como modelo</button></div>
 ${o.checklist.map((c,i)=>`<div class="item ${c.done?'done':''}"><button class="chk" aria-pressed="${c.done}" data-a="toggle" data-i="${i}">${c.done?'✓':''}</button><span class="t">${esc(c.t)}</span><button class="sm ghost noprint" data-a="editc" data-i="${i}">Editar</button><label class="cam" aria-label="Anexar foto">📷<input type="file" accept="image/*" data-i="${i}"></label><button class="sm ghost noprint" data-a="delc" data-i="${i}" aria-label="Apagar">×</button></div>
 ${c.fotos.length?`<div class="thumbs">${c.fotos.map((f,j)=>`<figure data-a="nota" data-i="${i}" data-j="${j}"><img src="${f.src}" alt="Foto"><figcaption>${f.nota?esc(f.nota):'Toque para comentar'}</figcaption></figure>`).join('')}</div>`:''}`).join('')||'<p class="mut">Checklist vazio. Adicione um item ou aplique o modelo.</p>'}`;
 if(tab==='diario')b=diario(o);
 if(tab==='graf')b=`<h2>Por mês</h2>${monthChart(o)}<h2>Por categoria</h2>${bars(o,'cat')}<h2>Por fornecedor</h2>${bars(o,'quem')}`;
 const orc=o.orc?`<div class="prog" aria-label="Orçamento usado"><i style="width:${Math.min(100,t/o.orc*100)}%"></i></div><div class="row" style="justify-content:space-between"><span>Orçamento ${brl(o.orc)}</span><b>${t>o.orc?'Estourou '+brl(t-o.orc):'Faltam '+brl(o.orc-t)}</b></div>`:'';
 return `<div class="top"><button class="ghost" data-a="back">← Obras</button><div class="row noprint"><button class="sm" data-a="csv">Excel</button><button class="sm" data-a="pdf">PDF</button></div></div>
 <h1>${esc(o.nome)}</h1><div class="row noprint" style="margin:10px 0"><select data-f="status" style="width:auto">${ST.map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}</select><button class="sm ghost" data-a="orc">${o.orc?'Mudar':'Definir'} orçamento</button></div>
 <div class="num big">${brl(t)}</div><p class="mut" style="margin:2px 0 0">Total gasto · A pagar: ${brl(pend(o).reduce((a,g)=>a+g.v,0))}</p>${orc}
 <div class="tabs" role="tablist">${tabs}</div>${b}`}

const render=()=>{document.getElementById('app').innerHTML=sb&&!user?entrar():eq?equipeV():cur==null?home():obra()};
const foto=(file,cb)=>{const r=new FileReader(),im=new Image();r.onload=()=>{im.onload=()=>{const k=Math.min(1,640/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=im.width*k;cv.height=im.height*k;cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);cb(cv.toDataURL('image/jpeg',.7))};im.src=r.result};r.readAsDataURL(file)};

function pdf(o){const d=new jsPDF();let y=20;
const L=(t,s=11,b=false)=>{d.setFontSize(s);d.setFont('helvetica',b?'bold':'normal');d.splitTextToSize(String(t).replace(/\u00a0/g,' '),182).forEach(ln=>{if(y>282){d.addPage();y=20}d.text(ln,14,y);y+=s*.5+2})};
const t=tot(o);L(o.nome,20,true);L('Status: '+o.status+' · Emitido em '+fd(hoje()));y+=4;L('Total gasto: '+brl(t),14,true);
if(o.orc)L('Orçamento: '+brl(o.orc)+' · '+(t>o.orc?'Estourou '+brl(t-o.orc):'Faltam '+brl(o.orc-t)));
L('A pagar: '+brl(pend(o).reduce((a,g)=>a+g.v,0)));y+=4;L('Gastos',14,true);
o.gastos.forEach(g=>L(`${fd(g.date)}  ${g.desc}  (${g.cat}${g.quem?', '+g.quem:''})  ${brl(g.v)}${g.pago?'':'  [A PAGAR'+(g.venc?' '+fd(g.venc):'')+']'}`,10));
y+=4;L('Checklist',14,true);o.checklist.forEach(c=>L((c.done?'[x] ':'[ ] ')+c.t+(c.fotos.length?`  (${c.fotos.length} foto(s))`:''),10));
y+=4;L('Diário de obra',14,true);
D(o).slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{L(`${fd(r.date)}  ${r.clima||''}${r.equipe?'  ·  Equipe: '+r.equipe:''}`,10,true);if(r.servicos)L(r.servicos,10);if(r.ocorr)L('Ocorrência: '+r.ocorr,10);if(r.fotos.length)L(`(${r.fotos.length} foto(s))`,9);y+=2});
d.save(o.nome+'.pdf')}
function pdfDiario(o){
 const registros=D(o).slice().sort((a,b)=>b.date.localeCompare(a.date));
 if(!registros.length){alert('Nao ha registros no diario para gerar o PDF.');return}
 const d=new jsPDF();let y=20;
 const L=(t,s=11,b=false)=>{d.setFontSize(s);d.setFont('helvetica',b?'bold':'normal');d.splitTextToSize(String(t).replace(/\u00a0/g,' '),182).forEach(ln=>{if(y>282){d.addPage();y=20}d.text(ln,14,y);y+=s*.5+2})};
 const foto=(src)=>{try{const p=d.getImageProperties(src),h=Math.min(100,p.height/p.width*182);if(y+h>282){d.addPage();y=20}d.addImage(src,'JPEG',14,y,182,h);y+=h+4}catch(e){L('Foto nao incluida no PDF.',9)}};
 L('Diario de obra',20,true);L(o.nome,14,true);L('Emitido em '+fd(hoje()));y+=4;
 registros.forEach(r=>{L(fd(r.date)+'  '+(r.clima||'')+(r.equipe?'  -  Equipe: '+r.equipe:''),12,true);if(r.servicos)L(r.servicos,10);if(r.ocorr)L('Ocorrencias: '+r.ocorr,10);r.fotos.forEach(f=>foto(f.src));y+=3});
 d.save('diario-'+o.nome+'.pdf')
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-a]');if(!b)return;
 const a=b.dataset.a,i=+b.dataset.i,o=S.obras.find(x=>x.id===cur);
 if(a==='equipe'){carregaEq();return}
 if(a==='eqback'){eq=null;inviteLink=null;render();return}
 if(a==='invite'){criarConvite().then(token=>{const url=new URL(location.href);url.searchParams.delete('convite');url.searchParams.set('convite',token);inviteLink=url.toString();render()}).catch(x=>alert('Não foi possível gerar o convite: '+x.message));return}
 if(a==='copy-invite'){
  const copiaManual=()=>{const input=document.getElementById('invite-link');input.select();if(!document.execCommand('copy'))alert('Não foi possível copiar automaticamente. Selecione o link e copie.');else alert('Link copiado.')};
  if(navigator.clipboard)navigator.clipboard.writeText(inviteLink).then(()=>alert('Link copiado.')).catch(copiaManual);
  else copiaManual();
  return
 }
 if(a==='eqdel'){if(confirm('Remover '+b.dataset.e+'? O acesso some na hora.'))remover(emp,b.dataset.e).then(carregaEq).catch(x=>alert(x.message));return}
 if(a==='login'||a==='signup'){auth(a);return}
 if(a==='logout'){clearTimeout(tm);(ready?push(S,emp):Promise.resolve()).then(()=>logout()).then(()=>{user=null;ready=false;cur=null;eq=null;emp=null;papel=null;S=seed();set('obras',S);render()}).catch(()=>alert('Sem conexão. Tente sair quando estiver online, para não perder alterações.'));return}
 if(a==='open'){cur=+b.dataset.id;tab='gastos';F={q:'',c:'',m:''}}
 else if(a==='back')cur=null;
 else if(a==='tab')tab=b.dataset.k;
 else if(a==='theme'){const r=document.documentElement;r.dataset.theme=getComputedStyle(r).getPropertyValue('--bg').trim()==='#000'?'light':'dark';return}
 else if(a==='pdf'){pdf(o);return}
 else if(a==='pdfdiario'){pdfDiario(o);return}
 else if(a==='csv'){const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(o.gastos.map(g=>({Data:g.date,'Descrição':g.desc,Categoria:g.cat,Fornecedor:g.quem||'',Valor:g.v,'Situação':g.pago?'Pago':'A pagar',Vencimento:g.venc||''}))),'Gastos');XLSX.writeFile(w,o.nome+'.xlsx');return}
 else if(a==='backup'){const u=URL.createObjectURL(new Blob([JSON.stringify(S)],{type:'application/json'}));const l=document.createElement('a');l.href=u;l.download='backup-obras-'+hoje()+'.json';l.click();return}
 else if(a==='adddia'){const s=document.getElementById('ds').value.trim(),x=document.getElementById('do').value.trim();
  if(!s&&!x&&!tmpD.length){alert('Escreva o que foi feito, uma ocorrência ou anexe uma foto.');return}
  D(o).push({date:document.getElementById('dd').value||hoje(),clima:document.getElementById('dc').value,equipe:document.getElementById('de').value.trim(),servicos:s,ocorr:x,fotos:tmpD.map(src=>({src,nota:''}))});tmpD=[]}
 else if(a==='editd'){const r=D(o)[i],s=prompt('O que foi feito',r.servicos||'');if(s===null)return;r.servicos=s.trim();const x=prompt('Ocorrências (vazio apaga)',r.ocorr||'');if(x!==null)r.ocorr=x.trim()}
 else if(a==='deld'){if(!confirm('Apagar este registro e suas fotos?'))return;D(o).splice(i,1)}
 else if(a==='dnota'){const f=D(o)[i].fotos[+b.dataset.j],n=prompt('Comentário da foto (vazio apaga o comentário)',f.nota||'');if(n===null)return;f.nota=n.trim()}
 else if(a==='addobra'){const n=document.getElementById('nova').value.trim();if(!n)return;S.obras.push({id:Date.now(),nome:n,status:'Em andamento',orc:0,checklist:[],gastos:[]})}
 else if(a==='orc'){const v=parseFloat(prompt('Quanto pode gastar nesta obra? (R$)',o.orc||''));if(!(v>=0))return;o.orc=v}
 else if(a==='addgasto'){const d=document.getElementById('gd').value.trim(),v=parseFloat(document.getElementById('gv').value),vc=document.getElementById('gvc').value;
  if(!d||!(v>0)){alert('Preencha a descrição e um valor maior que zero.');return}
  o.gastos.push({desc:d,v,cat:document.getElementById('gc').value,quem:document.getElementById('gq').value.trim(),date:hoje(),pago:!vc,venc:vc||undefined,foto:tmp||undefined});tmp=null}
 else if(a==='editg'){const g=o.gastos[i],d=prompt('Descrição',g.desc);if(d===null)return;const v=parseFloat(prompt('Valor (R$)',g.v));if(v>0)g.v=v;if(d.trim())g.desc=d.trim()}
 else if(a==='delg'){if(!confirm('Apagar este lançamento?'))return;o.gastos.splice(i,1)}
 else if(a==='pagar'){o.gastos[i].pago=true}
 else if(a==='addcheck'){const t=document.getElementById('ci').value.trim();if(!t)return;o.checklist.push({t,done:false,fotos:[]})}
 else if(a==='toggle')o.checklist[i].done=!o.checklist[i].done;
 else if(a==='editc'){const t=prompt('Texto do item',o.checklist[i].t);if(t&&t.trim())o.checklist[i].t=t.trim()}
 else if(a==='delc'){if(!confirm('Apagar este item e suas fotos?'))return;o.checklist.splice(i,1)}
 else if(a==='salvamodelo'){S.modelo=o.checklist.map(c=>c.t);alert('Modelo salvo com '+S.modelo.length+' itens.')}
 else if(a==='usamodelo'){S.modelo.forEach(t=>o.checklist.push({t,done:false,fotos:[]}))}
 else if(a==='nota'){const f=o.checklist[i].fotos[+b.dataset.j],n=prompt('Comentário da foto (vazio apaga o comentário)',f.nota||'');if(n===null)return;f.nota=n.trim()}
 save();render();
});
document.addEventListener('input',e=>{
 const f=e.target.dataset.f;if(!f||f==='status')return;F[f]=e.target.value;
 if(f==='dq'){document.getElementById('dlista').innerHTML=dlista(S.obras.find(x=>x.id===cur));return}
 document.getElementById('lista').innerHTML=lista(S.obras.find(x=>x.id===cur));
});
document.addEventListener('change',e=>{
 const t=e.target,o=S.obras.find(x=>x.id===cur);
 if(t.id==='rest'&&t.files[0]){t.files[0].text().then(x=>{const d=JSON.parse(x);if(!d.obras)throw 0;S=d;save();render()}).catch(()=>alert('Arquivo de backup inválido.'));return}
 if(t.dataset.f==='status'){o.status=t.value;save();return}
 if(t.type!=='file'||!t.files[0])return;
 if(t.id==='df'){[...t.files].forEach(f=>foto(f,d=>{tmpD.push(d);document.getElementById('dfl').firstChild.textContent='✓ '+tmpD.length+' foto(s) anexada(s) '}));return}
 if(t.id==='gf'){foto(t.files[0],d=>{tmp=d;document.getElementById('gfl').firstChild.textContent='✓ Foto anexada '})}
 else{const c=o.checklist[+t.dataset.i];foto(t.files[0],d=>{c.fotos.push({src:d,nota:''});c.done=true;save();render()})}
});
(async()=>{if(sb){user=await getUser();if(user){try{await finishInvite()}catch(e){alert('Não foi possível aceitar o convite: '+e.message)}await sync0()}}render();addEventListener('online',()=>{if(user&&!ready)sync0().then(render)})})();
navigator.storage?.persist?.();
