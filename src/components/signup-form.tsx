"use client";

import { useState, type FormEvent } from "react";

export default function SignupForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("password") !== data.get("confirmation")) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(data)) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not create the account.");
      form.reset(); setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the account."); }
    finally { setBusy(false); }
  }

  if (done) return <div role="status" className="mt-7"><p className="font-semibold">Account created.</p><p className="mt-2 text-sm text-slate-600">Sign in to use your new account.</p><a href="/auth/login" className="primary mt-5 inline-block rounded-lg px-5 py-3 font-semibold">Sign in</a></div>;

  return <form onSubmit={submit} className="mt-7 space-y-5">
    <div><label htmlFor="name" className="block font-semibold">Name</label><input id="name" name="name" required maxLength={100} autoComplete="name" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></div>
    <div><label htmlFor="email" className="block font-semibold">Email</label><input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></div>
    <div><label htmlFor="password" className="block font-semibold">Password</label><input id="password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /><p className="mt-1 text-xs text-slate-500">At least 12 characters.</p></div>
    <div><label htmlFor="confirmation" className="block font-semibold">Confirm password</label><input id="confirmation" name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    <button disabled={busy} className="primary w-full rounded-lg px-5 py-3 font-semibold disabled:opacity-50">{busy ? "Creating account…" : "Create account"}</button>
    <p className="text-center text-sm text-slate-600">Already have an account? <a href="/auth/login" className="font-semibold text-blue-700 underline">Sign in</a></p>
  </form>;
}
