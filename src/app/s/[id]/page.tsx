import Link from "next/link";
import { getShare, isExpired } from "@/lib/shares";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = await getShare(id);
  const expired = share ? isExpired(share) : false;

  return <main className="shell min-h-screen px-5 py-6 sm:px-8 sm:py-8"><div className="mx-auto max-w-4xl">
    <header className="flex items-center justify-between gap-3"><Link href="/" className="flex items-center gap-3 font-bold"><span className="brand-mark" aria-hidden="true">↓</span>Cloud Drop</Link>{process.env.STORAGE_MODE !== "aws" && <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">{share?.storage === "s3" ? "S3 development mode" : "Local prototype"}</span>}</header>
    <section className="mx-auto max-w-xl pt-20 sm:pt-32">
      {!share ? <div className="panel rounded-3xl p-8 sm:p-10"><div className="mb-6 text-5xl" aria-hidden="true">?</div><h1 className="text-4xl font-bold tracking-tight">Link not found</h1><p className="mt-4 leading-7 text-slate-600">Check that you copied the whole link, or ask the sender for a new one.</p><Link className="mt-7 inline-block font-semibold text-blue-700 underline" href="/">Share a file</Link></div>
      : expired ? <div className="panel rounded-3xl p-8 sm:p-10"><div className="mb-6 text-5xl" aria-hidden="true">⌛</div><h1 className="text-4xl font-bold tracking-tight">This link has expired</h1><p className="mt-4 leading-7 text-slate-600">The download window for <strong>{share.filename}</strong> ended. Ask the sender to create a new link.</p><Link className="mt-7 inline-block font-semibold text-blue-700 underline" href="/">Share a file</Link></div>
      : <div className="panel rounded-3xl p-8 sm:p-10"><div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-blue-100 text-3xl text-blue-700" aria-hidden="true">↓</div><h1 className="text-4xl font-bold tracking-tight">Your file is ready</h1><p className="mt-4 leading-7 text-slate-600">Download before {new Date(share.expiresAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })}.</p><div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="break-all font-semibold">{share.filename}</p><p className="mt-1 text-sm text-slate-500">{(share.size / 1024 / 1024).toFixed(2)} MB</p></div><a className="primary mt-7 inline-block rounded-lg px-6 py-3 font-semibold" href={`/api/shares/${share.id}/download`}>Download file</a><p className="mt-5 text-sm text-slate-500">No account needed.{process.env.STORAGE_MODE !== "aws" && " This local link works only while the app is running on this computer."}</p></div>}
    </section>
  </div></main>;
}
