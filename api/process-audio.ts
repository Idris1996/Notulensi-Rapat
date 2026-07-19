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

// Google Drive helper functions
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

async function downloadGoogleDriveFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string; originalname: string }> {
  const url = `https://docs.google.com/uc?export=download&id=${fileId}`;
  let response = await fetch(url);
  
  let mime = response.headers.get("content-type") || "";
  if (mime.includes("text/html")) {
    const text = await response.text();
    const confirmMatch = text.match(/confirm=([a-zA-Z0-9-_]+)/);
    if (confirmMatch) {
      const confirmToken = confirmMatch[1];
      const confirmUrl = `https://docs.google.com/uc?export=download&confirm=${confirmToken}&id=${fileId}`;
      response = await fetch(confirmUrl);
    } else {
      throw new Error("Gagal mengunduh berkas. Pastikan tautan Google Drive berstatus Publik (Siapa saja yang memiliki link dapat melihat) dan bukan berupa folder.");
    }
  }
  
  if (!response.ok) {
    throw new Error(`Google Drive returned status ${response.status}: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  mime = response.headers.get("content-type") || "audio/mpeg";
  if (mime.includes("text/html")) {
    throw new Error("Gagal mengunduh berkas. Pastikan tautan Google Drive berstatus Publik (Siapa saja yang memiliki link dapat melihat) dan bukan berupa folder.");
  }
  
  let originalname = "drive_audio.mp3";
  const contentDisposition = response.headers.get("content-disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
  if (filenameMatch) {
    originalname = filenameMatch[1];
  }
  
  return { buffer, mimeType: mime, originalname };
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
    let isTextOnly = false;
    let summaryPoints = "";

    if (contentType.includes("application/json")) {
      try {
        const body = await parseJsonBody(req);
        isTextOnly = body.isTextOnly === "true" || body.isTextOnly === true;
        summaryPoints = body.summaryPoints || "";
        realtimeTranscript = body.realtimeTranscript || "";

        if (!isTextOnly) {
          const driveUrl = body.driveUrl;
          if (driveUrl) {
            const fileId = extractGoogleDriveFileId(driveUrl);
            if (!fileId) {
              return res.status(400).json({ error: "Format tautan Google Drive tidak valid. Pastikan tautan lengkap dan benar." });
            }
            console.log(`Mengunduh berkas dari Google Drive dengan ID: ${fileId}...`);
            const driveFile = await downloadGoogleDriveFile(fileId);
            mimeType = driveFile.mimeType;
            
            // Clean mimeType
            if (mimeType.includes(";")) {
              mimeType = mimeType.split(";")[0].trim();
            }
            if (mimeType === "video/webm") {
              mimeType = "audio/webm";
            }
            
            // If larger than 4MB, upload to Gemini File API
            if (driveFile.buffer.length > 4 * 1024 * 1024) {
              console.log(`Berkas Google Drive berukuran besar (${(driveFile.buffer.length / (1024 * 1024)).toFixed(2)}MB). Mengunggah ke Gemini File API...`);
              
              const startRes = await fetch(
                `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
                {
                  method: "POST",
                  headers: {
                    "X-Goog-Upload-Protocol": "resumable",
                    "X-Goog-Upload-Command": "start",
                    "X-Goog-Upload-Header-Content-Length": driveFile.buffer.length.toString(),
                    "X-Goog-Upload-Header-Content-Type": mimeType,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    file: {
                      displayName: driveFile.originalname || "rekaman_drive.mp3",
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
                body: driveFile.buffer,
              });

              if (!uploadRes.ok) {
                throw new Error(`Gagal mengunggah file server ke Google: ${await uploadRes.text()}`);
              }

              const uploadResult: any = await uploadRes.json();
              fileUri = uploadResult.uri || uploadResult.file?.uri || "";
              if (!fileUri && uploadResult.name) {
                fileUri = `https://generativelanguage.googleapis.com/v1beta/${uploadResult.name}`;
              }
              if (!fileUri && uploadResult.file?.name) {
                fileUri = `https://generativelanguage.googleapis.com/v1beta/${uploadResult.file.name}`;
              }
              console.log(`Upload ke Gemini File API selesai. fileUri: ${fileUri}`);
            } else {
              base64Data = driveFile.buffer.toString("base64");
            }
          } else {
            fileUri = body.fileUri || "";
            mimeType = body.mimeType || "";
          }
        }
      } catch (parseErr: any) {
        return res.status(400).json({ error: `Gagal membaca body JSON atau memproses tautan Drive: ${parseErr.message}` });
      }
      if (!isTextOnly && !fileUri && !base64Data) {
        return res.status(400).json({ error: "fileUri atau driveUrl wajib disertakan untuk input JSON audio." });
      }
    } else {
      // Run the multer upload middleware
      await runMiddleware(req, res, upload.single("audio"));

      isTextOnly = req.body.isTextOnly === "true" || req.body.isTextOnly === true;
      summaryPoints = req.body.summaryPoints || "";
      realtimeTranscript = req.body.realtimeTranscript || "";

      if (!isTextOnly) {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: "File audio tidak ditemukan dalam request." });
        }
        mimeType = file.mimetype;

        // Strip parameters like ;codecs=opus to prevent Gemini API bad request errors
        if (mimeType.includes(";")) {
          mimeType = mimeType.split(";")[0].trim();
        }
        // Normalize Chrome's video/webm to audio/webm if recorded as audio-only
        if (mimeType === "video/webm") {
          mimeType = "audio/webm";
        }

        // If file is larger than 4MB, upload server-side to Gemini File API
        if (file.buffer.length > 4 * 1024 * 1024) {
          console.log(`Server-side uploading file (${(file.buffer.length / (1024 * 1024)).toFixed(2)}MB) to Gemini File API...`);
          const startRes = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
            {
              method: "POST",
              headers: {
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": file.buffer.length.toString(),
                "X-Goog-Upload-Header-Content-Type": mimeType,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                file: {
                  displayName: file.originalname || "rekaman_rapat.webm",
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
            body: file.buffer,
          });

          if (!uploadRes.ok) {
            throw new Error(`Gagal mengunggah file server ke Google: ${await uploadRes.text()}`);
          }

          const uploadResult: any = await uploadRes.json();
          fileUri = uploadResult.uri || uploadResult.file?.uri || "";
          if (!fileUri && uploadResult.name) {
            fileUri = `https://generativelanguage.googleapis.com/v1beta/${uploadResult.name}`;
          }
          if (!fileUri && uploadResult.file?.name) {
            fileUri = `https://generativelanguage.googleapis.com/v1beta/${uploadResult.file.name}`;
          }
          console.log(`Server-side upload complete. fileUri: ${fileUri}`);
        } else {
          base64Data = file.buffer.toString("base64");
        }
      }
    }

    // Polling loop to wait for the file to become ACTIVE on Google's servers if a fileUri is provided
    if (!isTextOnly && fileUri) {
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

    let promptText = "";

    if (isTextOnly) {
      promptText = `
Anda adalah seorang Notulen Rapat Profesional di Pengadilan Agama Paniai. Tugas utama Anda adalah menyusun Notulensi Rapat Dinas resmi yang SANGAT DETAIL, LENGKAP, FORMAL, dan PRESISI berdasarkan draf kasar/point-point rangkuman rapat yang disediakan oleh pengguna.

Tugas Anda adalah:
1. Mengubah poin-poin/catatan rapat kasar/ringkasan yang terkesan informal atau singkat menjadi format tata naskah dinas resmi Mahkamah Agung (Pengadilan Agama Paniai) yang baku, formal, rapi, dan rapi sesuai Pedoman Tata Naskah Dinas Mahkamah Agung.
2. Jangan kurangi detail atau kesimpulan penting apa pun dari poin-poin rapat yang disediakan. Kembangkan kalimatnya agar terdengar sangat profesional, dinas, dan formal tanpa menambah-nambahkan informasi fiktif yang tidak ada di dalam catatan kasar.
3. Gunakan gaya bahasa dinas formal (EYD V) untuk merangkum dan menguraikan draf rapat tersebut.
4. SANGAT PENTING (KUNCI UTAMA): Jangan melakukan penyederhanaan yang berlebihan. Setiap poin pembahasan, usulan, instruksi, masukan, kendala, dan tanggapan dari sub-bagian yang disebutkan di catatan kasar harus diuraikan secara RINCI, LENGKAP, dan JELAS.

Berikut adalah draf kasar/point-point rangkuman rapat yang disediakan pengguna:
"""
${summaryPoints}
"""

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

Hari/Tanggal/Jam : [Ambil dari draf kasar jika ada, jika tidak tulis: Tidak disebutkan]
Tempat           : Ruang Rapat Pengadilan Agama Paniai
Pimpinan Rapat   : [Ambil dari draf kasar jika ada, jika tidak tulis: Tidak disebutkan]
Peserta Rapat    : [Ambil dari draf kasar jika ada, jika tidak tulis: Tidak disebutkan] Orang

--------------------------------------------------------------------------------
                                 Agenda Rapat
--------------------------------------------------------------------------------
Rapat dibuka oleh Sekretaris PA Paniai dengan bersama-sama membaca "Bismillahirrahmanirrahim"
Selanjutnya rapat dipimpin oleh Sekretaris Pengadilan agama Paniai, Pembahasan Rapat dimulai dengan mendengarkan penyampaian dari masing-masing sub bagian, yaitu:
[Tuliskan poin pembahasan tiap sub bagian/pembicara yang disebutkan di draf kasar secara berurutan. Uraikan dengan sangat profesional, detail, dan lengkap. Jangan kurangi detail apapun.]

Selanjutnya kesimpulan rapat sebagai berikut:
[Daftar kesimpulan resmi dan keputusan penting yang disepakati pembicara di draf kasar secara detail.]

Selanjutnya pimpinan rapat menutup rapat selanjutnya rapat ditutup dengan ucapan "ALHAMDULILLAHIRABBIL'ALAMIN"

--------------------------------------------------------------------------------
Mengetahui,
Pimpinan Rapat                                        Notulen Rapat


[Nama Pimpinan Rapat]                                 [Nama Notulen Rapat]
NIP. [NIP Pimpinan]                                   NIP. [NIP Notulen]
`;
    } else {
      promptText = `
Anda adalah seorang Notulen Rapat Profesional di Pengadilan Agama Paniai. Tugas utama Anda adalah menyusun Notulensi Rapat Dinas yang EKSAT, SANGAT DETAIL, LENGKAP, dan FAKTUAL berdasarkan seluruh isi file audio yang diunggah.

ATURAN KETAT (ANTI-HALUSINASI & KELENGKAPAN MAKSIMAL):
1. HANYA tulis informasi yang benar-benar diucapkan atau disebutkan di dalam rekaman audio.
2. JANGAN PERNAH menambahkan asumsi, kesimpulan logis sendiri, atau mengarang cerita/agenda yang tidak ada di dalam audio.
3. Jika ada bagian format yang datanya tidak disebutkan di dalam audio (misalnya nama pimpinan atau jumlah peserta), tulis "Tidak disebutkan dalam rekaman" atau isi HANYA berdasarkan data tambahan yang diberikan oleh User pada kolom chat.
4. Tetap gunakan gaya bahasa formal (EYD V) untuk merangkum kalimat yang diucapkan pembicara, tanpa mengubah inti faktanya.
5. SANGAT PENTING (KUNCI UTAMA): Jangan melakukan penyederhanaan yang berlebihan (jangan terlalu sedikit atau terlalu singkat). Setiap pembahasan, setiap usulan, setiap instruksi, setiap masukan, setiap kendala, dan setiap tanggapan dari masing-masing pembicara atau perwakilan sub-bagian (Kepegawaian, Umum & Keuangan, Perencanaan, TI, Pelaporan, Kepaniteraan, dll.) harus dituliskan secara RINCI dan LENGKAP. Jabarkan seluruh pokok pikiran mereka ke dalam poin-poin yang komprehensif, padat informasi, dan mencakup semua detail penting yang diucapkan dari awal hingga akhir rekaman rapat.

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
[Tuliskan poin pembahasan tiap sub bagian/pembicara yang BENAR-BENAR berbicara di audio secara berurutan. Uraikan poin-poin tersebut dengan SANGAT DETAIL, LENGKAP, dan KOMPREHENSIF sesuai seluruh pokok pembicaraan yang terekam. Jangan ringkas terlalu pendek. Jika sub bagian tertentu berbicara banyak hal, catat seluruh pokok bahasannya secara terperinci.]

Selanjutnya kesimpulan rapat sebagai berikut:
[Daftar kesimpulan resmi dan keputusan-keputusan penting yang disepakati pembicara di dalam audio secara detail. Jika tidak ada keputusan eksplisit, tulis: "Tidak ada keputusan spesifik yang disebutkan".]

Selanjutnya pimpinan rapat menutup rapat selanjutnya rapat ditutup dengan ucapan "ALHAMDULILLAHIRABBIL'ALAMIN"

--------------------------------------------------------------------------------
Mengetahui,
Pimpinan Rapat                                        Notulen Rapat


[Nama Pimpinan Rapat]                                 [Nama Notulen Rapat]
NIP. [NIP Pimpinan]                                   NIP. [NIP Notulen]
`;
    }

    let finalPrompt = promptText;
    if (!isTextOnly && realtimeTranscript && realtimeTranscript.trim().length > 0) {
      finalPrompt += `

=== CATATAN TRANSKRIPSI REAL-TIME WEB SPEECH API (REFERENSI AKURASI 100%) ===
Berikut adalah hasil penangkapan suara real-time kata-demi-kata (speech-to-text) dari mikrofon browser selama rapat berlangsung. Gunakan teks ini bersama dengan rekaman suara audio di atas untuk memverifikasi detail kata per kata, nama pimpinan, sub-bagian, dan poin rapat yang dibicarakan secara eksak. Pastikan hasil notulensi sangat lengkap dan mencakup semua materi dari awal hingga akhir transkripsi kasar ini, tanpa ada yang dikurangi atau disederhanakan:
"${realtimeTranscript}"
=============================================================================
`;
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const parts: any[] = [];
    if (!isTextOnly) {
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
