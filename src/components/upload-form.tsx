"use client";

import { useRef, useState } from "react";

type Result = { id: string; filename: string; expiresAt: string };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function UploadForm({ storageMode }: { storageMode: "local" | "s3" }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState("1d");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");

  function choose(next: File | null) {
    if (status === "uploading") return;
    setFile(next);
    setStatus("idle"); setResult(null); setLink(""); setError(""); setProgress(null); setCopied(false); setVerifying(false);
    if (next && next.size > MAX_FILE_BYTES) setError("This file is larger than 10 MiB. Choose a smaller file.");
    if (next && next.size === 0) setError("This file is empty. Choose a file with content.");
  }

  function upload() {
    if (!file || file.size === 0 || file.size > MAX_FILE_BYTES) return;
    setStatus("uploading"); setError(""); setProgress(0); setVerifying(false); setResult(null); setLink(""); setCopied(false);
    if (storageMode === "s3") { void uploadToS3(file); return; }
    const body = new FormData(); body.append("file", file); body.append("expiry", expiry);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/shares");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.min(99, Math.round(event.loaded / event.total * 100)));
    };
    xhr.onload = () => {
      let data: { error?: string; share?: Result } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* keep useful fallback */ }
      if (xhr.status === 201 && data.share) {
        complete(data.share);
      } else {
        setError(data.error || "Upload failed. Check the local server and retry."); setStatus("error");
      }
    };
    xhr.onerror = () => { setError("Connection lost. Check the local server and retry."); setStatus("error"); };
    xhr.send(body);
  }

  function complete(share: Result) {
    setProgress(100); setResult(share); setLink(`${window.location.origin}/s/${share.id}`); setStatus("done"); setVerifying(false);
  }

  async function uploadToS3(selected: File) {
    try {
      const authorization = await fetch("/api/uploads/authorize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selected.name, contentType: selected.type || "application/octet-stream", size: selected.size, expiry }),
      });
      const signed = await authorization.json() as { error?: string; uploadId?: string; url?: string; fields?: Record<string, string> };
      if (!authorization.ok || !signed.uploadId || !signed.url || !signed.fields) throw new Error(signed.error || "Could not prepare the S3 upload.");
      const form = new FormData();
      for (const [key, value] of Object.entries(signed.fields)) form.append(key, value);
      form.append("file", selected);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", signed.url!);
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.min(99, Math.round(event.loaded / event.total * 100))); };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 rejected the upload (${xhr.status}). Check bucket CORS, Region, and permissions.`));
        xhr.onerror = () => reject(new Error("Could not reach S3. Check the bucket CORS rule and your connection."));
        xhr.send(form);
      });
      setVerifying(true);
      const finalized = await fetch("/api/uploads/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: signed.uploadId }),
      });
      const data = await finalized.json() as { error?: string; share?: Result };
      if (!finalized.ok || !data.share) throw new Error(data.error || "Could not verify the S3 upload.");
      complete(data.share);
    } catch (cause) {
      setVerifying(false);
      setError(cause instanceof Error ? cause.message : "S3 upload failed. Retry the upload.");
      setStatus("error");
    }
  }

  async function copyLink() {
    if (!result) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setError("Could not copy the link. Select and copy it below."); }
  }

  return <div className="panel rounded-[1.5rem] p-5 sm:p-8">
    <div className="mb-6 flex items-baseline justify-between gap-3"><h2 className="text-2xl font-bold tracking-tight">Share a file</h2><span className="text-sm text-slate-500">Up to 10 MiB</span></div>
    <input ref={inputRef} type="file" className="sr-only" id="file-picker" onChange={e => choose(e.target.files?.[0] || null)} />
    <div className="dropzone rounded-2xl px-5 py-10 text-center" data-active={dragging}
      onDragEnter={e => { e.preventDefault(); setDragging(true); }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { e.preventDefault(); setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0] || null); }}>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-3xl text-blue-700" aria-hidden="true">↑</div>
      <p className="font-semibold text-slate-800">Drag a file here</p>
      <p className="mt-1 text-sm text-slate-500">or choose one from your computer</p>
      <button type="button" disabled={status === "uploading"} className="secondary mt-5 rounded-lg px-5 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => inputRef.current?.click()}>Choose file</button>
    </div>
    {file && <div className="mt-5 flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"><div className="min-w-0"><p className="truncate font-semibold">{file.name}</p><p className="text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div><button className="text-sm font-semibold text-blue-700 underline disabled:opacity-50" type="button" disabled={status === "uploading"} onClick={() => { choose(null); if (inputRef.current) inputRef.current.value = ""; }}>Remove</button></div>}
    <label htmlFor="expiry" className="mt-7 block font-semibold">Link expires after</label>
    <select id="expiry" value={expiry} disabled={status === "uploading"} onChange={e => setExpiry(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-800 disabled:opacity-50">
      <option value="1m">1 minute (try expiry)</option><option value="1h">1 hour</option><option value="1d">1 day</option><option value="7d">7 days</option>
    </select>
    {status === "uploading" && <div className="mt-6" role="status"><div className="flex justify-between text-sm font-semibold"><span>{verifying ? "Verifying uploaded file…" : "Uploading…"}</span><span>{progress ?? 0}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress ?? 0}%` }} /></div></div>}
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p>}
    <button type="button" className="primary mt-6 w-full rounded-lg px-5 py-3 font-semibold" disabled={!file || file.size === 0 || file.size > MAX_FILE_BYTES || status === "uploading"} onClick={upload}>{status === "error" ? "Retry upload" : status === "done" ? "Upload again" : "Upload and create link"}</button>
    {result && <div className="mt-7 border-t border-slate-200 pt-6" role="status"><h3 className="text-lg font-bold">Your link is ready</h3><p className="mt-1 text-sm text-slate-600">Available until {new Date(result.expiresAt).toLocaleString()}.</p><label htmlFor="share-link" className="mt-4 block text-sm font-semibold">Share link</label><div className="mt-2 flex gap-2"><input id="share-link" readOnly value={link} onFocus={e => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="button" className="secondary rounded-lg px-4 py-2 font-semibold" onClick={copyLink}>{copied ? "Copied" : "Copy"}</button></div><a className="mt-4 inline-block font-semibold text-blue-700 underline" href={`/s/${result.id}`}>Open recipient page</a></div>}
  </div>;
}
