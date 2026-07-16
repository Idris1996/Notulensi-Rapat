import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { Request, Response } from "express";

// Disable default Vercel body parser to allow multer to parse multipart form data
export const config = {
  api: {
    bodyParser: false,
  },
};

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
});

// Helper function to run multer middleware
function runMiddleware(req: Request, res: Response, fn: any): Promise<any> {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

function parseJsonBody(req: Request): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY belum dikonfigurasi di environment Vercel Anda.",
      });
    }

    const contentType = req.headers["content-type"] || "";
    let fileUri = "";
    let mimeType = "";
    let base64Data = "";
    let realtimeTranscript = "";

    if (contentType.includes("application/json")) {
      try {
        const body = await parseJsonBody(req);
        fileUri = body.fileUri || "";
        mimeType = body.mimeType || "";
        realtimeTranscript = body.realtimeTranscript || "";
      } catch (parseErr: any) {
        return res.status(400).json({ error: `Gagal membaca body JSON: ${parseErr.message}` });
      }
      if (!fileUri) {
        return res.status(400).json({ error: "fileUri wajib disertakan untuk input JSON." });
      }
    } else {
      // Run the multer upload middleware
      await runMiddleware(req, res, upload.single("audio"));

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "File audio tidak ditemukan dalam request." });
      }
      mimeType = file.mimetype;
      base64Data = file.buffer.toString("base64");
      realtimeTranscript = req.body.realtimeTranscript || "";
    }

    // Strip parameters like ;codecs=opus to prevent Gemini API bad request errors
    if (mimeType.includes(";")) {
      mimeType = mimeType.split(";")[0].trim();
    }
    // Normalize Chrome's video/webm to audio/webm if recorded as audio-only
    if (mimeType === "video/webm") {
      mimeType = "audio/webm";
    }

    // Polling loop to wait for the file to become ACTIVE on Google's servers if a fileUri is provided
    if (fileUri) {
      const fileId = fileUri.split("/").pop(); // extract the id, e.g. "abc123xyz"
      const getFileUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${apiKey}`;
      
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts, 2 seconds interval = 60 seconds max
      let isActive = false;
      
      console.log(`Starting file status polling for ${fileId}...`);
      
      while (attempts < maxAttempts) {
        try {
          const fileCheckRes = await fetch(getFileUrl);
          if (fileCheckRes.ok) {
            const fileCheckData: any = await fileCheckRes.json();
            const state = fileCheckData.state;
            console.log(`Checking file status for ${fileId} (Attempt ${attempts + 1}/${maxAttempts}): state is ${state}`);
            if (state === "ACTIVE") {
              isActive = true;
              break;
            } else if (state === "FAILED") {
              throw new Error("Pengolahan file audio gagal di server Google.");
            }
          } else {
            console.warn(`Gagal memeriksa status file (HTTP ${fileCheckRes.status})`);
          }
        } catch (err: any) {
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

    const promptText = `
Anda adalah seorang Notulen Rapat Profesional di Pengadilan Agama Paniai. Tugas utama Anda adalah menyusun Notulensi Rapat Dinas yang EKSAT dan FAKTUAL berdasarkan file audio yang diunggah.

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
NIP. [NIP Pimpinan]                                   NIP. [NIP Notulen]
`;

    let finalPrompt = promptText;
    if (realtimeTranscript && realtimeTranscript.trim().length > 0) {
      finalPrompt += `

=== CATATAN TRANSKRIPSI REAL-TIME WEB SPEECH API (REFERENSI AKURASI 100%) ===
Berikut adalah hasil penangkapan suara real-time kata-demi-kata (speech-to-text) dari mikrofon browser selama rapat berlangsung. Gunakan teks ini bersama dengan rekaman suara audio di atas untuk memverifikasi detail kata per kata, nama pimpinan, sub-bagian, dan poin rapat yang dibicarakan secara eksak. Pastikan hasil notulensi sangat lengkap dan mencakup semua materi dari awal hingga akhir transkripsi kasar ini, tanpa ada yang dikurangi atau disederhanakan:
"${realtimeTranscript}"
=============================================================================
`;
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const parts: any[] = [];
    if (fileUri) {
      parts.push({
        fileData: {
          fileUri: fileUri,
          mimeType: mimeType,
        },
      });
    } else {
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      });
    }
    parts.push({
      text: finalPrompt,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: parts,
      },
    });

    const notulensiResult = response.text;
    if (!notulensiResult) {
      throw new Error("Gemini tidak mengembalikan hasil teks. Silakan coba rekam atau unggah ulang.");
    }

    return res.status(200).json({ result: notulensiResult });
  } catch (error: any) {
    console.error("Gagal memproses audio dengan Gemini:", error);
    return res.status(500).json({ error: error.message || "Gagal memproses notulensi rapat." });
  }
}
