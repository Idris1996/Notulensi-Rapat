import { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { fileSize, mimeType, displayName } = req.body;
    if (!fileSize || !mimeType) {
      return res.status(400).json({ error: "fileSize dan mimeType wajib disertakan." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY tidak dikonfigurasi di environment Vercel Anda. Silakan tambahkan di dashboard Vercel.",
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": fileSize.toString(),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: {
            displayName: displayName || "Rapat Dinas Audio",
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: `Gagal menginisialisasi upload ke Google: ${errText}`,
      });
    }

    const uploadUrl = response.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      return res.status(500).json({
        error: "Google tidak mengembalikan header x-goog-upload-url.",
      });
    }

    res.json({ uploadUrl });
  } catch (error: any) {
    console.error("Gagal membuat upload URL:", error);
    res.status(500).json({ error: error.message || "Gagal membuat upload URL." });
  }
}
