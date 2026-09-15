"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountSetupClient({token}:{token:string}){
 const router=useRouter();const[loading,setLoading]=useState(true);const[error,setError]=useState("");const[account,setAccount]=useState<{fullName:string;email:string|null;purpose:string}|null>(null);const[password,setPassword]=useState("");const[confirm,setConfirm]=useState("");const[showPassword,setShowPassword]=useState(false);const[busy,setBusy]=useState(false);
 useEffect(()=>{void (async()=>{try{const r=await fetch(`/api/account/setup?token=${encodeURIComponent(token)}`,{cache:"no-store"});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(typeof b.message==="string"?b.message:"Unable to validate this setup link.");setAccount(b.account)}catch(x){setError(x instanceof Error?x.message:"Unable to validate this setup link.")}finally{setLoading(false)}})()},[token]);
 async function submit(e:FormEvent){e.preventDefault();setError("");if(password!==confirm){setError("The passwords do not match.");return}setBusy(true);try{const r=await fetch("/api/account/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,password})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(typeof b.message==="string"?b.message:"Password setup failed.");router.replace(`${b.nextPath}?setup=complete`)}catch(x){setError(x instanceof Error?x.message:"Password setup failed.")}finally{setBusy(false)}}
 if(loading)return <p className="mt-8 text-sm text-black/50">Validating secure setup link…</p>;
 if(!account)return <div className="mt-8 border-l-2 border-[#a12620] bg-[#f6e8e6] p-4 text-sm text-[#7e1d18]">{error||"This setup link is unavailable."}</div>;
 return <form onSubmit={submit} className="mt-8 space-y-5">
  <div className="border border-black bg-[#f2f2ef] p-4"><p className="casa-kicker text-black/40">{account.purpose==="CASA_INTERNAL"?"CASA internal account / password recovery":"School account / password recovery"}</p><p className="mt-2 font-semibold">{account.fullName}</p><p className="mt-1 text-sm text-black/50">{account.email}</p></div>
  <label className="casa-label"><span>Create password</span><input className="casa-field" type={showPassword?"text":"password"} minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
  <label className="casa-label"><span>Confirm password</span><input className="casa-field" type={showPassword?"text":"password"} minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label>
  <button type="button" onClick={()=>setShowPassword(v=>!v)} className="casa-button inline-flex items-center gap-2" aria-pressed={showPassword} aria-label={showPassword?"Hide passwords":"Show passwords"}><svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.75"/></svg><span>{showPassword?"Hide passwords":"Show passwords"}</span></button>
  {error&&<div className="border-l-2 border-[#a12620] bg-[#f6e8e6] p-3 text-sm text-[#7e1d18]">{error}</div>}
  <button disabled={busy} className="casa-button-primary">{busy?"Securing account…":"Set password & continue"}</button>
 </form>
}
