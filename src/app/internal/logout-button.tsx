"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export default function InternalLogoutButton(){const router=useRouter();const[busy,setBusy]=useState(false);async function logout(){setBusy(true);try{await fetch("/api/auth/logout",{method:"POST"})}finally{router.replace("/internal/login");router.refresh()}}return <button type="button" onClick={()=>void logout()} disabled={busy} className="mt-4 border border-white/25 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-white/70 hover:border-white hover:text-white">{busy?"Signing out…":"Logout"}</button>}
