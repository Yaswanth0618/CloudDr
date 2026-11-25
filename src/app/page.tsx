import UploadForm from "@/components/upload-form";
import Link from "next/link";
import { authConfigured, currentSession } from "@/lib/auth";
import { storageMode } from "@/lib/shares";

export const dynamic = "force-dynamic";

export default async function Home() {
  let mode: "local" | "s3" | "aws";
  try { mode = storageMode(); }
  catch { return <main className="shell grid min-h-screen place-items-center p-6"><p role="alert" className="panel max-w-lg rounded-xl p-8">Cloud Drop is not configured for production. Set the required server environment variables.</p></main>; }
  const s3Mode = mode !== "local";
  const publicMode = mode === "aws";
  if (publicMode && !authConfigured()) return <main className="shell grid min-h-screen place-items-center p-6"><p role="alert" className="panel max-w-lg rounded-xl p-8">Cloud Drop account sign-in is not configured. Set the required server environment variables.</p></main>;
  const session = publicMode && authConfigured() ? await currentSession() : null;
  return <main className="shell px-5 py-6 sm:px-8 sm:py-8">
    <div className="mx-auto max-w-5xl">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><span className="brand-mark" aria-hidden="true">↓</span><span className="text-lg font-bold tracking-tight">Cloud Drop</span></div>
        <div className="flex items-center gap-3 text-sm font-semibold">
          {publicMode ? <>{session ? <><span className="hidden text-slate-600 sm:inline">{session.name || session.email || "Signed in"}</span><form action="/auth/logout" method="post"><button className="text-blue-700 underline">Sign out</button></form></> : <><Link href="/signup" className="text-blue-700 underline">Sign up</Link><a href="/auth/login" className="secondary rounded-lg px-3 py-2">Sign in</a></>}</> : <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-800">{s3Mode ? "S3 development mode" : "Local prototype"}</span>}
        </div>
      </header>
      <section className="grid items-start gap-12 pb-16 pt-16 lg:grid-cols-[.8fr_1.2fr] lg:gap-16 lg:pt-28">
        <div className="max-w-md">
          <h1 className="text-5xl font-bold leading-[1.05] tracking-[-.055em] sm:text-6xl">A file, a link, a little time.</h1>
          <p className="mt-6 text-lg leading-8 text-slate-600">Choose a file and set how long it can be downloaded. The link stops working when its time is up.</p>
          {!publicMode && <div className="mt-10 border-l-2 border-blue-300 pl-5 text-sm leading-6 text-slate-600">{s3Mode ? "Files upload to your private S3 bucket. Share metadata remains on this computer, and links work only while this development app is running." : "This learning prototype stores files on this computer. Links work while this local app is running and are not an AWS integration."}</div>}
        </div>
        <UploadForm storageMode={s3Mode ? "s3" : "local"} />
      </section>
      <footer className="border-t border-slate-200 py-5 text-sm text-slate-500">Cloud Drop{!publicMode && <> · {s3Mode ? "S3 development with local metadata" : "Local development"}</>}</footer>
    </div>
  </main>;
}
