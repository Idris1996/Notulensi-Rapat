import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile) {
      return NextResponse.json(
        { error: "File audio tidak ditemukan dalam request." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY tidak dikonfigurasi di environment. Silakan tambahkan di dashboard Vercel." },
        { status: 500 }
      );
    }

    // Initialize modern Google GenAI Client
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Convert file to buffer then base64
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString("base64");

    let mimeType = audioFile.type || "audio/webm";
    // Strip codecs from mimeType
    if (mimeType.includes(";")) {
      mimeType = mimeType.split(";")[0].trim();
    }
    // Normalize webm video files
    if (mimeType === "video/webm") {
      mimeType = "audio/webm";
    }

    const promptText = `
Anda adalah seorang Notulen Rapat Profesional senior di Pengadilan Agama Paniai. 
Tugas Anda adalah mendengarkan rekaman suara rapat yang diunggah dan menyusun Notulensi Rapat Dinas yang sangat akurat, formal, dan rapi secara eksak mengikuti format tata naskah dinas instansi berikut.

Hasilkan output menggunakan format Markdown dengan struktur berikut:

MAHKAMAH AGUNG REPUBLIK INDONESIA
DIREKTORAT JENDERAL BADAN PERADILAN AGAMA
PENGADILAN TINGGI AGAMA JAYAPURA
PENGADILAN AGAMA PANIAI
Kompleks Kantor Bupati Paniai, Paniai Timur, Paniai, Telp. 085244544676
www.pa-paniai.go.id, pengadilan.agama.paniai@gmail.com
================================================================================

                                NOTULEN RAPAT

| Kode Dokumen | Tgl. Pembuatan | Tgl. Revisi | Tgl. Efektif |
| :--- | :--- | :--- | :--- |
| FM/AM/04/02 | 02/05/2018 | ..................... | 02/05/2018 |

Hari/Tanggal/Jam : [Ekstrak hari, tanggal, dan jam pelaksanaan dari audio/konteks. Jika tidak ada, gunakan waktu sekarang atau tanggal rapat yang dibicarakan]
Tempat           : [Ekstrak lokasi pelaksanaan, default: Ruang Rapat Pengadilan Agama Paniai]
Pimpinan Rapat   : [Ekstrak nama pimpinan rapat dari audio/konteks]
Peserta Rapat    : [Isi dengan jumlah peserta] Orang

--------------------------------------------------------------------------------
                                 Agenda Rapat
--------------------------------------------------------------------------------
Rapat dibuka oleh Sekretaris PA Paniai dengan bersama-sama membaca "Bismillahirrahmanirrahim"
Selanjutnya rapat dipimpin oleh Sekretaris Pengadilan agama Paniai, Pembahasan Rapat dimulai dengan mendengarkan penyampaian dari masing-masing sub bagian, yaitu:
1. [Tuliskan poin pembahasan sub bagian/peserta secara berurutan berdasarkan isi audio secara formal, runut, dan mendalam]
2. [Poin pembahasan selanjutnya...]
3. [Dst...]

Selanjutnya kesimpulan rapat sebagai berikut:
1. [Tuliskan poin kesimpulan/keputusan rapat secara formal, tegas, dan detail]
2. [Poin kesimpulan 2...]
3. [Dst...]

Selanjutnya pimpinan rapat menutup rapat selanjutnya rapat ditutup dengan ucapan "ALHAMDULILLAHIRABBIL'ALAMIN"

--------------------------------------------------------------------------------
Mengetahui,
Pimpinan Rapat                                        Notulen Rapat


[Nama Pimpinan Rapat/Default]                         [Nama Notulen Rapat/Default]
NIP. [NIP Pimpinan]                                   NIP. [NIP Notulen]

Aturan Penting:
1. Seluruh bahasa harus menggunakan Bahasa Indonesia formal, baku, dan sesuai dengan Tata Naskah Dinas Mahkamah Agung RI.
2. Ekstrak data-data (Hari/Tanggal, Pimpinan Rapat, Nama, NIP) seakurat mungkin dari audio. Jika tidak disebut secara spesifik dalam audio, berikan placeholder logis atau nama-nama fiktif khas instansi peradilan (misal Pimpinan: H. Ahmad, S.H., M.H., Notulen: Sarah, S.Kom.) dan berikan NIP yang realistis (18 digit).
3. Buat rincian Agenda Rapat dan Pembahasan Sub-bagian secara detail, mendalam, dan profesional, menangkap seluruh substansi diskusi, masalah yang dibahas, dan usulan solusi.
4. Tulis Kesimpulan Rapat secara butir per butir (bulleted) yang aplikatif dan taktis.
5. Harap pertahankan separator garis pembatas '---' atau '===' secara persis sesuai format.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data,
          },
        },
        {
          text: promptText,
        },
      ],
    });

    return NextResponse.json({ result: response.text });
  } catch (error) {
    console.error("Gagal memproses audio dengan Gemini:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memproses notulensi rapat." },
      { status: 500 }
    );
  }
}
