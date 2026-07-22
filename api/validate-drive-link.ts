import { Request, Response } from "express";

function extractGoogleDriveFileId(url: string): string | null {
  const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (fileDMatch && fileDMatch[1]) {
    return fileDMatch[1];
  }
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }
  const openIdMatch = url.match(/\/open\?id=([a-zA-Z0-9-_]+)/);
  if (openIdMatch && openIdMatch[1]) {
    return openIdMatch[1];
  }
  if (/^[a-zA-Z0-9-_]{25,50}$/.test(url.trim())) {
    return url.trim();
  }
  return null;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { driveUrl } = req.body;
    if (!driveUrl) {
      return res.status(400).json({ error: "Tautan Google Drive wajib disertakan." });
    }
    const fileId = extractGoogleDriveFileId(driveUrl);
    if (!fileId) {
      return res.status(400).json({ error: "Format tautan Google Drive tidak valid." });
    }

    const url = `https://docs.google.com/uc?export=download&id=${fileId}`;
    let response = await fetch(url, { method: "HEAD" });
    
    let mime = response.headers.get("content-type") || "";
    if (mime.includes("text/html")) {
      const getRes = await fetch(url);
      const text = await getRes.text();
      if (text.includes("confirm=") || text.includes("Google Drive - Virus scan warning") || text.includes("download_warning")) {
        return res.json({
          valid: true,
          fileId,
          fileName: "File Audio Google Drive (Butuh Konfirmasi)",
          fileSize: "Ukuran Besar (>25MB)",
          mimeType: "audio/mpeg"
        });
      } else {
        throw new Error("Gagal mengunduh berkas. Pastikan tautan Google Drive berstatus Publik (Siapa saja yang memiliki link dapat melihat) dan bukan berupa folder.");
      }
    }
    
    let originalname = "drive_audio.mp3";
    const contentDisposition = response.headers.get("content-disposition") || "";
    const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
    if (filenameMatch) {
      originalname = filenameMatch[1];
    }
    
    let cleanMime = (mime || "").split(";")[0].trim().toLowerCase();
    if (!cleanMime || cleanMime === "application/octet-stream" || cleanMime === "binary/octet-stream") {
      const ext = originalname.toLowerCase().split('.').pop();
      if (ext === "m4a" || ext === "mp4") cleanMime = "audio/mp4";
      else if (ext === "wav") cleanMime = "audio/wav";
      else if (ext === "ogg" || ext === "opus") cleanMime = "audio/ogg";
      else if (ext === "webm") cleanMime = "audio/webm";
      else if (ext === "aac") cleanMime = "audio/aac";
      else if (ext === "flac") cleanMime = "audio/flac";
      else cleanMime = "audio/mpeg";
    }

    const contentLength = response.headers.get("content-length");
    const sizeMb = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) + " MB" : "Tidak diketahui";

    res.json({
      valid: true,
      fileId,
      fileName: originalname,
      fileSize: sizeMb,
      mimeType: cleanMime
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Tautan Google Drive tidak valid atau tidak dapat diakses secara publik." });
  }
}
