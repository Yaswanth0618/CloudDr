import SignupForm from "@/components/signup-form";
import Link from "next/link";

export default function SignupPage() {
  return <main className="shell grid min-h-screen place-items-center px-5 py-10">
    <div className="panel w-full max-w-md rounded-[1.5rem] p-7 sm:p-9">
      <Link href="/" className="font-bold text-blue-800">← Cloud Drop</Link>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">Create an account</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">An account is optional. Anyone can share a file.</p>
      <SignupForm />
    </div>
  </main>;
}
