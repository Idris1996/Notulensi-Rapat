import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let fileUri = "";
    let mimeType = "";
    let base64Data = "";
    let notes = "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      fileUri = body.fileUri;
      mimeType = body.mimeType;
      notes = body.notes || body.realtimeTranscript || "";
    } else {
      const formData = await request.formData();
      const audioFile = formData.get("file") || formData.get("audio");
      notes = formData.get("notes") || formData.get("realtimeTranscript") || "";

      if (!audioFile) {
        return NextResponse.json(
          { error: "File audio tidak ditemukan dalam request. Pastikan parameter bernama 'file' atau 'audio'." },
          { status: 400 }
        );
      }

      // Validasi tipe data file audio untuk mencegah crash pembacaan buffer
      if (!audioFile || typeof audioFile === "string" || !audioFile.arrayBuffer) {
        return NextResponse.json(
          { error: "Format berkas audio tidak valid atau rusak. Silakan coba rekam atau unggah berkas audio asli." },
          { status: 400 }
        );
      }

      // Ambil bytes dari file audio
      const bytes = await audioFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      mimeType = audioFile.type || "audio/webm";

      if (mimeType.includes(";")) {
        mimeType = mimeType.split(";")[0].trim();
      }
      if (mimeType === "video/webm") {
        mimeType = "audio/webm";
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "GEMINI_API_KEY belum dikonfigurasi di environment Vercel Anda." },
          { status: 500 }
        );
      }

      // Jika file lebih besar dari 4MB, upload server-side ke Gemini File API
      if (buffer.length > 4 * 1024 * 1024) {
        console.log(`[NextJS] Server-side uploading file (${(buffer.length / (1024 * 1024)).toFixed(2)}MB) to Gemini File API...`);
        const startRes = await fetch(
          `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "X-Goog-Upload-Protocol": "resumable",
              "X-Goog-Upload-Command": "start",
              "X-Goog-Upload-Header-Content-Length": buffer.length.toString(),
              "X-Goog-Upload-Header-Content-Type": mimeType,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              file: {
                displayName: audioFile.name || "rekaman_rapat.webm",
              },
            }),
          }
        );

        if (!startRes.ok) {
          throw new Error(`Gagal menginisialisasi upload server ke Google: ${await startRes.text()}`);
        }

        const uploadUrl = startRes.headers.get("x-goog-upload-url");
        if (!uploadUrl) {
          throw new Error("Google tidak mengembalikan header x-goog-upload-url.");
        }

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
            "Content-Type": mimeType,
          },
          body: buffer,
        });

        if (!uploadRes.ok) {
          throw new Error(`Gagal mengunggah file server ke Google: ${await uploadRes.text()}`);
        }

        const uploadResult = await uploadRes.json();
        fileUri = uploadResult.uri || uploadResult.file?.uri || "";
        if (!fileUri && uploadResult.name) {
          fileUri = `https://generativelanguage.googleapis.com/v1beta/${uploadResult.name}`;
        }
        if (!fileUri && uploadResult.file?.name) {
          fileUri = `https://generativelanguage.googleapis.com/v1beta/${uploadResult.file.name}`;
        }
        console.log(`[NextJS] Server-side upload complete. fileUri: ${fileUri}`);
      } else {
        base64Data = buffer.toString("base64");
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY belum dikonfigurasi di environment Vercel Anda." },
        { status: 500 }
      );
    }

    // Inisialisasi Google GenAI SDK (menggunakan @google/generative-ai)
    const genAI = new GoogleGenerativeAI(apiKey);

    // Polling loop to wait for the file to become ACTIVE on Google's servers if a fileUri is provided
    if (fileUri) {
      const fileId = fileUri.split("/").pop(); // extract the id, e.g. "abc123xyz"
      const getFileUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${apiKey}`;
      
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts, 2 seconds interval = 60 seconds max
      let isActive = false;
      
      console.log(`Starting NextJS file status polling for ${fileId}...`);
      
      while (attempts < maxAttempts) {
        try {
          const fileCheckRes = await fetch(getFileUrl);
          if (fileCheckRes.ok) {
            const fileCheckData = await fileCheckRes.json();
            const state = fileCheckData.state;
            console.log(`NextJS checking file status for ${fileId} (Attempt ${attempts + 1}/${maxAttempts}): state is ${state}`);
            if (state === "ACTIVE") {
              isActive = true;
              break;
            } else if (state === "FAILED") {
              throw new Error("Pengolahan file audio gagal di server Google.");
            }
          } else {
            console.warn(`Gagal memeriksa status file (HTTP ${fileCheckRes.status})`);
          }
        } catch (err) {
          console.error("Error checking file status:", err);
          if (err.message && err.message.includes("gagal")) {
            throw err;
          }
        }
        
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      
      if (!isActive) {
        throw new Error("File audio masih dalam proses pemrosesan di server Google. Silakan klik tombol 'Proses Notulensi' lagi dalam beberapa detik.");
      }
    }

    const systemInstruction = `Anda adalah seorang Notulen Rapat Profesional di Pengadilan Agama Paniai. Tugas utama Anda adalah menyusun Notulensi Rapat Dinas yang EKSAT dan FAKTUAL berdasarkan file audio yang diunggah.

ATURAN KETAT (ANTI-HALUSINASI):
1. HANYA tulis informasi yang benar-benar diucapkan atau disebutkan di dalam rekaman audio.
2. JANGAN PERNAH menambahkan asumsi, kesimpulan logis sendiri, atau mengarang cerita/agenda yang tidak ada di dalam audio.
3. Jika ada bagian format yang datanya tidak disebutkan di dalam audio (misalnya nama pimpinan atau jumlah peserta), tulis "Tidak disebutkan dalam rekaman" atau isi HANYA berdasarkan data tambahan yang diberikan oleh User pada kolom chat.
4. Tetap gunakan gaya bahasa formal (EYD V) untuk merangkum kalimat yang diucapkan pembicara, tanpa mengubah inti faktanya.

Hasilkan output menggunakan format Markdown berikut:

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

Hari/Tanggal/Jam : [Isi hanya jika ada di audio/perintah user, jika tidak tulis: Tidak disebutkan]
Tempat           : Ruang Rapat Pengadilan Agama Paniai
Pimpinan Rapat   : [Isi nama pimpinan dari audio/perintah user]
Peserta Rapat    : [Isi jumlah peserta] Orang

--------------------------------------------------------------------------------
                                 Agenda Rapat
--------------------------------------------------------------------------------
Rapat dibuka oleh Sekretaris PA Paniai dengan bersama-sama membaca "Bismillahirrahmanirrahim"
Selanjutnya rapat dipimpin oleh Sekretaris Pengadilan agama Paniai, Pembahasan Rapat dimulai dengan mendengarkan penyampaian dari masing-masing sub bagian, yaitu:
[Tuliskan poin pembahasan tiap sub bagian/pembicara yang BENAR-BENAR berbicara di audio secara berurutan. Jika tidak ada pembahasan sub bagian tertentu, jangan dikarang, cukup lewatkan.]

Selanjutnya kesimpulan rapat sebagai berikut:
[Daftar kesimpulan resmi yang disepakati pembicara di dalam audio. Jika tidak ada keputusan eksplisit, tulis: "Tidak ada keputusan spesifik yang disebutkan".]

Selanjutnya pimpinan rapat menutup rapat selanjutnya rapat ditutup dengan ucapan "ALHAMDULILLAHIRABBIL'ALAMIN"

--------------------------------------------------------------------------------
Mengetahui,
Pimpinan Rapat                                        Notulen Rapat


[Nama Pimpinan Rapat]                                 [Nama Notulen Rapat]
NIP. [NIP Pimpinan]                                   NIP. [NIP Notulen]`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction,
    });

    let finalPrompt = "Buat draf notulensi rapat dinas resmi berdasarkan rekaman audio di atas secara eksat dan faktual mengikuti instruksi sistem.";
    if (notes && notes.trim().length > 0) {
      finalPrompt += `

=== CATATAN TRANSKRIPSI REAL-TIME WEB SPEECH API (REFERENSI AKURASI 100%) ===
Berikut adalah hasil penangkapan suara real-time kata-demi-kata (speech-to-text) dari mikrofon browser selama rapat berlangsung. Gunakan teks ini bersama dengan rekaman suara audio di atas untuk memverifikasi detail kata per kata, nama pimpinan, sub-bagian, dan poin rapat yang dibicarakan secara eksak. Pastikan hasil notulensi sangat lengkap dan mencakup semua materi dari awal hingga akhir transkripsi kasar ini, tanpa ada yang dikurangi atau disederhanakan:
"${notes}"
=============================================================================`;
    }

    let contents = [];
    if (fileUri) {
      contents.push({
        fileData: {
          fileUri: fileUri,
          mimeType: mimeType,
        },
      });
    } else {
      contents.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      });
    }
    contents.push({
      text: finalPrompt,
    });

    const result = await model.generateContent(contents);

    const responseText = result.response.text();
    if (!responseText) {
      throw new Error("Model Gemini tidak mengembalikan respon teks. Silakan rekam atau unggah ulang berkas audio.");
    }

    return NextResponse.json({ result: responseText });
  } catch (error) {
    console.error("Gagal menyusun notulensi:", error);
    return NextResponse.json(
      { error: error.message || "Terjadi kesalahan internal saat memproses audio." },
      { status: 500 }
    );
  }
}
