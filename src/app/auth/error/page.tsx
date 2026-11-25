import Link from "next/link";

export default function AuthErrorPage() {
  return <main className="shell grid min-h-screen place-items-center px-5"><div className="panel max-w-md rounded-3xl p-8"><h1 className="text-3xl font-bold tracking-tight">Sign-in did not finish</h1><p className="mt-4 leading-7 text-slate-600">Your session was not created. Please try signing in again.</p><Link href="/auth/login" className="primary mt-7 inline-block rounded-lg px-5 py-3 font-semibold">Try sign-in again</Link></div></main>;
}
