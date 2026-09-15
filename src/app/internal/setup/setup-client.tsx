"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function InternalSetupClient() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Password confirmation does not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/internal/setup", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ fullName, email, password, setupToken }) });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "CASA setup could not be completed.");
      router.replace("/internal/login?setup=complete");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "CASA setup could not be completed."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5 border-t border-black/15 pt-7">
      <label className="casa-label"><span>Full name</span><input className="casa-field" value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required /></label>
      <label className="casa-label"><span>Email</span><input className="casa-field" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
      <label className="casa-label"><span>One-time setup key</span><input className="casa-field" type="password" value={setupToken} onChange={e => setSetupToken(e.target.value)} autoComplete="off" required /></label>
      <label className="casa-label"><span>Password</span><input className="casa-field" type="password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required /></label>
      <label className="casa-label"><span>Confirm password</span><input className="casa-field" type="password" minLength={12} maxLength={128} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required /></label>
      {error && <div className="border-l-2 border-[#a12620] bg-[#f6e8e6] px-4 py-3 text-sm text-[#7e1d18]">{error}</div>}
      <button type="submit" disabled={busy} className="casa-button-primary w-full">{busy ? "Creating Super Admin..." : "Create first CASA Super Admin"}</button>
    </form>
  );
}
