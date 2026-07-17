require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");
const fs = require("fs");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  ImageRun
} = require("docx");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so the Next.js Frontend on Vercel can access this backend safely
app.use(cors({
  origin: "*", // You can restrict this to your actual Vercel URL later for tighter security
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Setup JSON parsing limits to support larger payloads
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Configure Multer for large audio uploads (up to 100MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

// Initialize Gemini SDK with API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Helper function to format DOCX cells with vertical padding
function createStyledCell(text, isHeader = false, widthPct = 25) {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            bold: isHeader,
            font: "Arial",
            size: 20, // 10pt
          }),
        ],
      }),
    ],
    width: {
      size: widthPct,
      type: WidthType.PERCENTAGE,
    },
    shading: isHeader
      ? {
          fill: "F2F2F2",
        }
      : undefined,
    margins: {
      top: 100,
      bottom: 100,
      left: 150,
      right: 150,
    },
  });
}

// Function to convert Markdown output into a beautifully structured Word Document
async function generateDocxBuffer(markdown) {
  const lines = markdown.split("\n");

  let pimpinanRapat = "Pimpinan Rapat/Ketua";
  let notulenRapat = "Sekretaris/Notulen";
  let nipPimpinan = ".....................";
  let nipNotulen = ".....................";
  let hariTanggalJam = ".....................";
  let tempat = "Ruang Rapat Pengadilan Agama Paniai";
  let agendaRows = [];
  let kesimpulanRows = [];
  let state = "none";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Hari/Tanggal/Jam")) {
      hariTanggalJam = trimmed.split(":")[1]?.trim() || hariTanggalJam;
    } else if (trimmed.startsWith("Tempat")) {
      tempat = trimmed.split(":")[1]?.trim() || tempat;
    } else if (trimmed.startsWith("Pimpinan Rapat")) {
      pimpinanRapat = trimmed.split(":")[1]?.trim() || pimpinanRapat;
    }

    if (trimmed.toLowerCase().includes("agenda rapat")) {
      state = "agenda";
      continue;
    } else if (
      trimmed.toLowerCase().includes("kesimpulan rapat") || 
      trimmed.toLowerCase().includes("kesimpulan rapat sebagai berikut") || 
      trimmed.toLowerCase().includes("kesimpulan / keputusan")
    ) {
      state = "kesimpulan";
      continue;
    } else if (
      trimmed.toLowerCase().includes("mengetahui") || 
      (trimmed.toLowerCase().includes("pimpinan rapat") && trimmed.toLowerCase().includes("notulen rapat"))
    ) {
      state = "none";
    }

    const isDivider = /^[=\-\s|_:|…*]*$/.test(trimmed) || trimmed === "";
    if (state === "agenda") {
      if (trimmed && !isDivider && !trimmed.toLowerCase().includes("agenda rapat")) {
        agendaRows.push(trimmed);
      }
    } else if (state === "kesimpulan") {
      if (trimmed && !isDivider && !trimmed.toLowerCase().includes("kesimpulan rapat") && !trimmed.toLowerCase().includes("kesimpulan / keputusan")) {
        kesimpulanRows.push(trimmed);
      }
    }
  }

  // Parse bottom signatures block to extract specific names & NIPs dynamically
  let signatureLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].trim().startsWith("Mengetahui") || 
      (lines[i].trim().includes("Pimpinan Rapat") && lines[i].trim().includes("Notulen Rapat"))
    ) {
      signatureLineIndex = i;
    }
  }

  if (signatureLineIndex !== -1) {
    const sigLines = lines.slice(signatureLineIndex).filter(l => l.trim());
    const nameLines = sigLines.filter(
      l => l.trim() && !l.includes("Mengetahui") && !l.includes("Pimpinan Rapat") && !l.includes("Notulen Rapat") && !l.includes("NIP")
    );
    if (nameLines.length >= 1) {
      const parts = nameLines[0].split(/\s{3,}/); // split by multiple spaces
      if (parts[0]) pimpinanRapat = parts[0].replace(/[\[\]]/g, "").trim();
      if (parts[1]) notulenRapat = parts[1].replace(/[\[\]]/g, "").trim();
    }
    const nipLines = sigLines.filter(l => l.includes("NIP."));
    if (nipLines.length >= 1) {
      const parts = nipLines[0].split(/\s{3,}/);
      if (parts[0]) nipPimpinan = parts[0].replace(/NIP\.\s*/gi, "").replace(/[\[\]]/g, "").trim();
      if (parts[1]) nipNotulen = parts[1].replace(/NIP\.\s*/gi, "").replace(/[\[\]]/g, "").trim();
    }
  }

  const children = [];

  const addTextHeader = (targetArray) => {
    targetArray.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "MAHKAMAH AGUNG REPUBLIK INDONESIA", bold: true, font: "Arial", size: 28 }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "DIREKTORAT JENDERAL BADAN PERADILAN AGAMA", bold: true, font: "Arial", size: 24 }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "PENGADILAN TINGGI AGAMA JAYAPURA", bold: true, font: "Arial", size: 24 }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "PENGADILAN AGAMA PANIAI", bold: true, font: "Arial", size: 28 }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Kompleks Kantor Bupati Paniai, Paniai Timur, Paniai, Telp. 085244544676", font: "Arial", size: 18, italics: true }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "www.pa-paniai.go.id, pengadilan.agama.paniai@gmail.com", font: "Arial", size: 18, italics: true }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "=========================================================================",
            bold: true,
            font: "Arial",
            size: 20,
          }),
        ],
        spacing: { after: 300 },
      })
    );
  };

  // Header Logo Kop Surat (if available on the server, otherwise fallback to styled text)
  let hasKopSuratImg = false;
  let kopPath = path.join(process.cwd(), "kop surat.png");
  if (fs.existsSync(kopPath)) {
    hasKopSuratImg = true;
  }

  if (hasKopSuratImg) {
    try {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: fs.readFileSync(kopPath),
              transformation: {
                width: 600,
                height: 110,
              },
            }),
          ],
          spacing: { after: 300 },
        })
      );
    } catch (docxImgErr) {
      console.error("Gagal menyematkan kop surat gambar, menggunakan teks kop surat:", docxImgErr);
      addTextHeader(children);
    }
  } else {
    addTextHeader(children);
  }

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "NOTULEN RAPAT", bold: true, font: "Arial", size: 32 }),
      ],
      spacing: { after: 200 },
    })
  );

  // Metadata Table
  const metadataTable = new Table({
    rows: [
      new TableRow({
        children: [
          createStyledCell("Kode Dokumen", true),
          createStyledCell("Tgl. Pembuatan", true),
          createStyledCell("Tgl. Revisi", true),
          createStyledCell("Tgl. Efektif", true),
        ],
      }),
      new TableRow({
        children: [
          createStyledCell("FM/AM/04/02"),
          createStyledCell("02/05/2018"),
          createStyledCell("....................."),
          createStyledCell("02/05/2018"),
        ],
      }),
    ],
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
  });

  children.push(metadataTable);
  children.push(new Paragraph({ spacing: { after: 200 } }));

  // Details lines
  const addDetailLine = (label, value) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: label.padEnd(20, " "), bold: true, font: "Arial", size: 22 }),
          new TextRun({ text: `: ${value}`, font: "Arial", size: 22 }),
        ],
        spacing: { after: 100 },
      })
    );
  };

  addDetailLine("Hari/Tanggal/Jam", hariTanggalJam);
  addDetailLine("Tempat", tempat);
  addDetailLine("Pimpinan Rapat", pimpinanRapat);

  let pesertaLine = ".....................";
  const pLine = lines.find(l => l.includes("Peserta Rapat"));
  if (pLine) {
    pesertaLine = pLine.split(":")[1]?.trim() || pesertaLine;
  }
  addDetailLine("Peserta Rapat", pesertaLine);

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "------------------------------------------------------------------------------------------------------------------------",
          color: "888888",
        }),
      ],
      spacing: { before: 200, after: 200 },
    })
  );

  // Agenda Rapat Section
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Agenda Rapat", bold: true, font: "Arial", size: 24 }),
      ],
      spacing: { after: 200 },
    })
  );

  if (agendaRows.length > 0) {
    for (const row of agendaRows) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: row, font: "Arial", size: 22 })],
          spacing: { after: 100 },
        })
      );
    }
  } else {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Rapat dibuka oleh Sekretaris PA Paniai dengan bersama-sama membaca "Bismillahirrahmanirrahim".',
            font: "Arial",
            size: 22,
          }),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Selanjutnya rapat dipimpin oleh Sekretaris Pengadilan Agama Paniai, Pembahasan Rapat dimulai dengan mendengarkan penyampaian dari masing-masing sub bagian.",
            font: "Arial",
            size: 22,
          }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  // Kesimpulan Section
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "------------------------------------------------------------------------------------------------------------------------",
          color: "888888",
        }),
      ],
      spacing: { before: 200, after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Kesimpulan / Keputusan Rapat", bold: true, font: "Arial", size: 24 }),
      ],
      spacing: { after: 200 },
    })
  );

  if (kesimpulanRows.length > 0) {
    for (const row of kesimpulanRows) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: row, font: "Arial", size: 22 })],
          spacing: { after: 100 },
        })
      );
    }
  } else {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Belum ada kesimpulan rapat yang dimasukkan.",
            font: "Arial",
            size: 22,
            italics: true,
          }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Selanjutnya pimpinan rapat menutup rapat selanjutnya rapat ditutup dengan ucapan "ALHAMDULILLAHIRABBIL\'ALAMIN".',
          font: "Arial",
          size: 22,
        }),
      ],
      spacing: { before: 200, after: 300 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "------------------------------------------------------------------------------------------------------------------------",
          color: "888888",
        }),
      ],
      spacing: { after: 300 },
    })
  );

  // Signatures Section
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "Mengetahui,", font: "Arial", size: 22 })],
      spacing: { after: 100 },
    })
  );

  const signaturesTable = new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Pimpinan Rapat", bold: true, font: "Arial", size: 22 })],
              }),
              new Paragraph({ spacing: { before: 1200 } }),
              new Paragraph({
                children: [new TextRun({ text: pimpinanRapat, bold: true, font: "Arial", size: 22 })],
              }),
              new Paragraph({
                children: [new TextRun({ text: `NIP. ${nipPimpinan}`, font: "Arial", size: 20 })],
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Notulen Rapat", bold: true, font: "Arial", size: 22 })],
              }),
              new Paragraph({ spacing: { before: 1200 } }),
              new Paragraph({
                children: [new TextRun({ text: notulenRapat, bold: true, font: "Arial", size: 22 })],
              }),
              new Paragraph({
                children: [new TextRun({ text: `NIP. ${nipNotulen}`, font: "Arial", size: 20 })],
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
    ],
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "auto" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
  });

  children.push(signaturesTable);

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

// Liveness Probe Check
app.get("/api/health", (req, res) => {
  res.json({ status: "online", service: "PA Paniai Notulen AI Decoupled Backend" });
});

// Main Audio Processing and Formatting API
app.post("/api/process-audio", upload.single("file"), async (req, res) => {
  try {
    const isTextOnly = req.body.isTextOnly === "true" || req.body.isTextOnly === true || !req.file;
    const summaryPoints = req.body.summaryPoints || "";
    const realtimeTranscript = req.body.realtimeTranscript || "";

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY tidak dikonfigurasi di environment Render.com.",
      });
    }

    let mimeType = "";
    let base64Data = "";

    if (!isTextOnly) {
      if (!req.file) {
        return res.status(400).json({ error: "File audio tidak ditemukan dalam request." });
      }
      mimeType = req.file.mimetype;
      base64Data = req.file.buffer.toString("base64");

      // Clean up Chrome/Firefox recording parameters if present
      if (mimeType.includes(";")) {
        mimeType = mimeType.split(";")[0].trim();
      }
      if (mimeType === "video/webm") {
        mimeType = "audio/webm";
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
5. JANGAN PERNAH menggunakan karakter asterisk (*) atau double asterisks (**) dalam seluruh hasil teks output Anda, baik untuk menandai bullet point/list maupun cetak tebal (bold). Untuk daftar list, gunakan nomor (1, 2, 3) atau huruf (a, b, c). Untuk cetak tebal/penekanan, gunakan HURUF KAPITAL secara bersih.
6. PENGGABUNGAN POIN BERULANG: Jika terdapat poin pembahasan, usulan, atau kesimpulan yang berulang, tumpang tindih, atau memiliki makna yang sama dari draf kasar, Anda harus menyatukan dan mengonsolidasikannya menjadi satu poin tunggal yang utuh dan komprehensif. Pilihlah susunan redaksi atau struktur kalimat yang sekiranya paling mengalir, tepat, dan nyambung dengan kalimat-kalimat lainnya di sekitarnya.

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
[Tuliskan poin pembahasan tiap sub bagian/pembicara yang disebutkan di draf kasar secara berurutan. Uraikan dengan sangat profesional, detail, dan lengkap. Jangan kurangi detail apapun. Gunakan penomoran 1, 2, 3 alih-alih bullet points asterisks.]

 Selanjutnya kesimpulan rapat sebagai berikut:
[Daftar kesimpulan resmi dan keputusan penting yang disepakati pembicara di draf kasar secara detail. Gunakan penomoran atau huruf alih-alih bullet points asterisks.]

Selanjutnya pimpinan rapat menutup rapat selanjutnya rapat ditutup dengan ucapan "ALHAMDULILLAHIRABBIL'ALAMIN"

--------------------------------------------------------------------------------
Mengetahui,
Pimpinan Rapat                                        Notulen Rapat


Ahmad Muhtar, S.H.I                                   Idris Al Basyir, A.Md
NIP. 198112122009121004                               NIP. 199601112025061004
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
6. JANGAN PERNAH menggunakan karakter asterisk (*) atau double asterisks (**) dalam seluruh hasil teks output Anda, baik untuk menandai bullet point/list maupun cetak tebal (bold). Untuk daftar list, gunakan nomor (1, 2, 3) atau huruf (a, b, c). Untuk cetak tebal/penekanan, gunakan HURUF KAPITAL secara bersih.
7. PENGGABUNGAN POIN BERULANG: Jika terdapat poin pembahasan, usulan, kendala, atau kesimpulan yang diucapkan berulang kali atau memiliki makna yang sama dalam rekaman, Anda harus menyatukan dan mengonsolidasikannya menjadi satu poin tunggal yang paling lengkap. Pilihlah susunan redaksi atau struktur kalimat yang sekiranya paling mengalir, tepat, dan nyambung dengan kalimat-kalimat lainnya di sekitarnya.

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
[Tuliskan poin pembahasan tiap sub bagian/pembicara yang BENAR-BENAR berbicara di audio secara berurutan. Jika tidak ada pembahasan sub bagian tertentu, jangan dikarang, cukup lewatkan. Gunakan penomoran 1, 2, 3 alih-alih bullet points asterisks.]

 Selanjutnya kesimpulan rapat sebagai berikut:
[Daftar kesimpulan resmi yang disepakati pembicara di dalam audio. Jika tidak ada keputusan eksplisit, tulis: "Tidak ada keputusan spesifik yang disebutkan". Gunakan penomoran atau huruf alih-alih bullet points asterisks.]

Selanjutnya pimpinan rapat menutup rapat selanjutnya rapat ditutup dengan ucapan "ALHAMDULILLAHIRABBIL'ALAMIN"

--------------------------------------------------------------------------------
Mengetahui,
Pimpinan Rapat                                        Notulen Rapat


Ahmad Muhtar, S.H.I                                   Idris Al Basyir, A.Md
NIP. 198112122009121004                               NIP. 199601112025061004
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

    // Call gemini-1.5-flash model via official SDK
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let notulensiResult = "";

    if (isTextOnly) {
      const response = await model.generateContent([finalPrompt]);
      notulensiResult = response.response.text() || "";
    } else {
      const audioPart = {
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      };
      const response = await model.generateContent([audioPart, finalPrompt]);
      notulensiResult = response.response.text() || "";
    }

    if (!notulensiResult) {
      throw new Error("Gemini tidak mengembalikan hasil teks. Silakan coba rekam atau unggah ulang.");
    }

    // Sesuai Aturan Ketat No. 6/7, hilangkan seluruh asterisk (*) demi kepatuhan Tata Naskah
    notulensiResult = notulensiResult.replace(/\*/g, "");

    // KEDUA: Jalankan AI Pass Kedua untuk menyusun Ringkasan Eksekutif 3 Keputusan Utama Rapat dalam format JSON
    let executiveSummary = [];
    try {
      const summaryPrompt = `Berdasarkan hasil notulensi rapat Pengadilan Agama Paniai berikut, sarikan 3 keputusan atau tindakan utama yang paling penting dari rapat tersebut ke dalam tepat 3 poin ringkasan eksekutif (bullet points). 
Gunakan bahasa Indonesia yang sangat formal, padat, jelas, berwibawa, dan berfokus pada hasil/keputusan tindakan nyata (actionable decisions).

Format output harus berupa JSON array berisi tepat 3 string, contoh:
[
  "Menyetujui alokasi anggaran renovasi ruang sidang utama yang akan dimulai pada awal bulan depan.",
  "Menginstruksikan subbagian Kepegawaian untuk segera menyelesaikan evaluasi kinerja PPNPN paling lambat tanggal 25 bulan ini.",
  "Menyepakati jadwal rapat koordinasi berkala setiap hari Senin pagi pukul 09:00 WIT untuk memantau progres pelaksanaan program kerja."
]

Hasil Notulensi Rapat:
${notulensiResult}`;

      const summaryModel = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const summaryResponse = await summaryModel.generateContent([summaryPrompt]);
      const rawJsonText = summaryResponse.response.text() || "[]";
      const parsed = JSON.parse(rawJsonText.trim());
      
      if (Array.isArray(parsed) && parsed.length > 0) {
        executiveSummary = parsed.slice(0, 3).map(item => item.replace(/\*/g, "").trim());
      }
    } catch (summaryErr) {
      console.error("Gagal menjabarkan Ringkasan Eksekutif AI:", summaryErr);
      // Fallback 3 bullet points if generation fails
      executiveSummary = [
        "Keputusan rapat dinas resmi Pengadilan Agama Paniai telah berhasil dirumuskan.",
        "Program kerja masing-masing sub bagian disetujui untuk dilaksanakan sesuai target waktu.",
        "Meningkatkan koordinasi internal untuk memastikan kelancaran administrasi perkara dinas."
      ];
    }

    res.json({
      result: notulensiResult,
      executiveSummary: executiveSummary,
    });

  } catch (error) {
    console.error("Gagal memproses audio dengan Gemini:", error);
    res.status(500).json({ error: error.message || "Gagal memproses notulensi rapat." });
  }
});

// Endpoint to generate and export DOCX
app.post("/api/export-docx", express.json(), async (req, res) => {
  try {
    const { markdown } = req.body;
    if (!markdown) {
      return res.status(400).json({ error: "Markdown content is required." });
    }

    const docxBuffer = await generateDocxBuffer(markdown);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", "attachment; filename=notulen_rapat.docx");
    res.send(docxBuffer);
  } catch (error) {
    console.error("Gagal mengekspor DOCX:", error);
    res.status(500).json({ error: error.message || "Gagal mengekspor dokumen DOCX." });
  }
});

// Serve static images/files like Kop Surat
app.get("/kop surat.png", (req, res) => {
  const imagePath = path.join(process.cwd(), "kop surat.png");
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    // Return empty transparent pixel or error
    res.status(404).send("File kop surat.png tidak ditemukan.");
  }
});

// Run server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[PA PANIAI BACKEND] Server running on port ${PORT}`);
});
