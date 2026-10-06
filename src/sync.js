import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const sb=url&&key?createClient(url,key):null;
const last=new Map();
const rowOf=o=>({id:o.id,nome:o.nome,status:o.status,orc:o.orc||0,dados:{gastos:o.gastos,checklist:o.checklist,diario:o.diario||[]}});
const sig=r=>JSON.stringify(r);
export const getUser=async()=>(await sb.auth.getSession()).data.session?.user||null;
export const login=(e,p)=>sb.auth.signInWithPassword({email:e,password:p});
export const signup=(e,p)=>sb.auth.signUp({email:e,password:p});
export const logout=()=>sb.auth.signOut();
export async function pull(){
 const [a,b]=await Promise.all([sb.from('obras').select('*'),sb.from('config').select('modelo').maybeSingle()]);
 if(a.error||b.error)throw a.error||b.error;
 const obras=a.data.map(r=>({id:r.id,nome:r.nome,status:r.status,orc:+r.orc,gastos:[],checklist:[],diario:[],...r.dados}));
 obras.forEach(o=>last.set(o.id,sig(rowOf(o))));
 return {obras,modelo:b.data?.modelo};
}
export async function push(S,uid){
 const ch=S.obras.map(o=>[o.id,rowOf(o)]).filter(([id,r])=>last.get(id)!==sig(r));
 if(ch.length){
  const {error}=await sb.from('obras').upsert(ch.map(([,r])=>({...r,empresa_id:uid,updated_at:new Date().toISOString()})),{onConflict:'empresa_id,id'});
  if(error)throw error;ch.forEach(([id,r])=>last.set(id,sig(r)));
 }
 const {data,error}=await sb.from('obras').select('id');if(error)throw error;
 const keep=new Set(S.obras.map(o=>o.id)),gone=data.map(r=>r.id).filter(id=>!keep.has(id));
 if(gone.length){const {error:e}=await sb.from('obras').delete().in('id',gone);if(e)throw e;gone.forEach(id=>last.delete(id))}
 const {error:c}=await sb.from('config').upsert({empresa_id:uid,modelo:S.modelo});if(c)throw c;
}
export const entrarEmpresa=async()=>{const {data,error}=await sb.rpc('entrar_empresa');if(error)throw error;return data[0]};
export const listaEquipe=async()=>{const {data,error}=await sb.from('membros').select('email,papel').order('papel');if(error)throw error;return data};
export const criarConvite=async()=>{const {data,error}=await sb.rpc('criar_link_convite');if(error)throw error;return data};
export const convidar=criarConvite;
export const aceitarConvite=async(token)=>{const {data,error}=await sb.rpc('aceitar_convite',{p_token:token});if(error)throw error;return data[0]};
export const remover=async(emp,email)=>{const {error}=await sb.from('membros').delete().eq('empresa_id',emp).eq('email',email);if(error)throw error};
