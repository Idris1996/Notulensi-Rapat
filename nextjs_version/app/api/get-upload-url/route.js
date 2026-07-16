import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { fileSize, mimeType, displayName } = await request.json();
    if (!fileSize || !mimeType) {
      return NextResponse.json(
        { error: "fileSize dan mimeType wajib disertakan." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY belum dikonfigurasi di environment Vercel Anda." },
        { status: 500 }
      );
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
      return NextResponse.json(
        { error: `Gagal menginisialisasi upload ke Google: ${errText}` },
        { status: response.status }
      );
    }

    const uploadUrl = response.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      return NextResponse.json(
        { error: "Google tidak mengembalikan header x-goog-upload-url." },
        { status: 500 }
      );
    }

    return NextResponse.json({ uploadUrl });
  } catch (error) {
    console.error("Gagal membuat upload URL:", error);
    return NextResponse.json(
      { error: error.message || "Gagal membuat upload URL." },
      { status: 500 }
    );
  }
}
