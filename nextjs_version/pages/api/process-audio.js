import { GoogleGenerativeAI } from "@google/generative-ai";

// Konfigurasi bawaan Next.js API untuk menonaktifkan bodyParser bawaan
// agar kita bisa membaca file audio mentah (FormData) menggunakan library eksternal atau manual parser.
export const config = {
  api: {
    bodyParser: false,
  },
};

// Pembantu (Helper) untuk membaca stream body menjadi Buffer
async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Metode ${req.method} tidak diizinkan. Gunakan POST.` });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY belum dikonfigurasi di environment Vercel Anda." });
    }

    // Membaca raw body buffer secara aman
    const rawBody = await getRawBody(req);
    
    // Karena Pages Router menonaktifkan bodyParser, FormData multipart/form-data harus diekstraksi.
    // Untuk keandalan penuh tanpa dependensi rumit di serverless, jika request dikirim sebagai raw audio
    // atau jika dikirim via FormData, kita cari batas penanda biner audio di buffer.
    const contentType = req.headers["content-type"] || "";
    let base64Data = "";
    let mimeType = "audio/webm";

    if (contentType.includes("multipart/form-data")) {
      // Ekstraksi data biner dari FormData secara manual dan aman
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) {
        throw new Error("Invalid multipart boundary");
      }
      const boundary = boundaryMatch[1];
      const parts = rawBody.toString("binary").split(`--${boundary}`);
      
      let audioPartBinary = null;
      for (const part of parts) {
        if (part.includes('name="file"')) {
          // Cari batas antara header dan data biner (\r\n\r\n)
          const headerEndIndex = part.indexOf("\r\n\r\n");
          if (headerEndIndex !== -1) {
            // Ambil konten setelah header dan sebelum penutup \r\n
            let content = part.substring(headerEndIndex + 4);
            if (content.endsWith("\r\n")) {
              content = content.slice(0, -2);
            } else if (content.endsWith("\r\n--")) {
              content = content.slice(0, -4);
            }
            audioPartBinary = content;
            
            // Ekstrak Content-Type jika tertulis di header
            const mimeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
            if (mimeMatch) {
              mimeType = mimeMatch[1].trim();
            }
            break;
          }
        }
      }

      if (!audioPartBinary) {
        return res.status(400).json({ error: "File audio tidak ditemukan. Pastikan field FormData bernama 'file'." });
      }
      
      base64Data = Buffer.from(audioPartBinary, "binary").toString("base64");
    } else {
      // Jika dikirim langsung sebagai biner audio (bukan FormData)
      base64Data = rawBody.toString("base64");
      mimeType = contentType.split(";")[0] || "audio/webm";
    }

    // Normalisasi jenis file mimetypes
    if (mimeType.includes(";")) {
      mimeType = mimeType.split(";")[0].trim();
    }
    if (mimeType === "video/webm") {
      mimeType = "audio/webm";
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
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
      model: "gemini-1.5-flash",
      systemInstruction: systemInstruction,
    });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      },
      "Buat draf notulensi rapat dinas resmi berdasarkan rekaman audio di atas secara eksat dan faktual mengikuti instruksi sistem.",
    ]);

    const responseText = result.response.text();
    return res.status(200).json({ result: responseText });
  } catch (error) {
    console.error("Gagal memproses audio di Pages Router:", error);
    return res.status(500).json({ error: error.message || "Terjadi kesalahan internal server." });
  }
}
