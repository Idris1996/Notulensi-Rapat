import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
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
  HeadingLevel,
  ImageRun
} from "docx";

dotenv.config();

const app = express();
const PORT = 3000;

// Log all incoming requests to console and server.log
app.use((req, res, next) => {
  const logLine = `[${new Date().toISOString()}] ${req.method} ${req.path} - Headers: ${JSON.stringify(req.headers)}\n`;
  console.log(`[Express API] ${req.method} ${req.path}`);
  try {
    fs.appendFileSync(path.join(process.cwd(), "server.log"), logLine);
  } catch (err) {
    console.error("Gagal menulis ke server.log:", err);
  }
  next();
});

// Set up multer for file uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Lazy Initialize Gemini Client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in environment. Please add it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Helper for docx table cell with custom alignments, colspans, shading, and padding
interface CreateCellOptions {
  text?: string;
  paragraphs?: Paragraph[];
  bold?: boolean;
  isHeader?: boolean;
  alignment?: any;
  widthPct?: number;
  columnSpan?: number;
  shadingColor?: string;
  fontName?: string;
  fontSize?: number;
}

function createCell({
  text,
  paragraphs,
  bold = false,
  isHeader = false,
  alignment = AlignmentType.CENTER,
  widthPct = 25,
  columnSpan = 1,
  shadingColor = undefined,
  fontName = "Arial",
  fontSize = 20,
}: CreateCellOptions): TableCell {
  const childrenParagraphs = paragraphs || [
    new Paragraph({
      alignment,
      children: [
        new TextRun({
          text: text || "",
          bold: bold || isHeader,
          font: fontName,
          size: fontSize,
        }),
      ],
    }),
  ];

  return new TableCell({
    children: childrenParagraphs,
    columnSpan,
    width: {
      size: widthPct,
      type: WidthType.PERCENTAGE,
    },
    shading: shadingColor || isHeader
      ? {
          fill: shadingColor || "F2F2F2",
        }
      : undefined,
    margins: {
      top: 140,
      bottom: 140,
      left: 180,
      right: 180,
    },
  });
}

// Function to convert Markdown to a professional DOCX Document with high-fidelity layout
async function generateDocxBuffer(markdown: string): Promise<Buffer> {
  // Parse the markdown lines and extract details
  const lines = markdown.split("\n");

  // Default values
  let pimpinanRapat = "Ahmad Muhtar, S.H.I";
  let notulenRapat = "Idris Al Basyir, A.Md";
  let nipPimpinan = "198112122009121004";
  let nipNotulen = "199601112025061004";
  let hariTanggalJam = ".....................";
  let tempat = "Ruang Rapat Pengadilan Agama Paniai";
  let agendaRows: string[] = [];

  let isAgenda = false;

  // Quick extract patterns
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Hari/Tanggal/Jam")) {
      hariTanggalJam = trimmed.split(":")[1]?.trim() || hariTanggalJam;
    } else if (trimmed.startsWith("Tempat")) {
      tempat = trimmed.split(":")[1]?.trim() || tempat;
    } else if (trimmed.startsWith("Pimpinan Rapat")) {
      const val = trimmed.split(":")[1]?.trim();
      if (val && val !== "[Isi nama pimpinan dari audio/perintah user]" && !val.includes("Isi nama pimpinan")) {
        pimpinanRapat = val;
      }
    }

    if (trimmed.toLowerCase().includes("agenda rapat")) {
      isAgenda = true;
      continue;
    } else if (trimmed.startsWith("---") || trimmed.startsWith("===") || trimmed.startsWith("Mengetahui") || (trimmed.includes("Pimpinan Rapat") && trimmed.includes("Notulen Rapat"))) {
      if (isAgenda) {
        isAgenda = false;
      }
    }

    if (isAgenda) {
      agendaRows.push(line); // Preserve raw line to keep structure
    }
  }

  // Parse signatures from bottom if they exist
  let signatureStart = false;
  const signatureLines: string[] = [];
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("Mengetahui") || (trimmed.includes("Pimpinan Rapat") && trimmed.includes("Notulen Rapat"))) {
      signatureStart = true;
    }
    if (signatureStart) {
      signatureLines.push(line);
    }
  });

  if (signatureLines.length > 0) {
    const nameLines = signatureLines.filter(l => {
      const t = l.trim();
      return t && !t.startsWith("Mengetahui") && !t.includes("Pimpinan Rapat") && !t.includes("Notulen Rapat") && !t.includes("NIP.");
    });
    if (nameLines.length >= 1) {
      const parts = nameLines[0].split(/\s{3,}/);
      if (parts[0]) {
        const val = parts[0].replace(/[\[\]]/g, "").trim();
        if (val && val !== "[Nama Pimpinan Rapat]" && !val.includes("Nama Pimpinan")) pimpinanRapat = val;
      }
      if (parts[1]) {
        const val = parts[1].replace(/[\[\]]/g, "").trim();
        if (val && val !== "[Nama Notulen Rapat]" && !val.includes("Nama Notulen")) notulenRapat = val;
      }
    }
    const nipLines = signatureLines.filter(l => l.includes("NIP."));
    if (nipLines.length >= 1) {
      const parts = nipLines[0].split(/\s{3,}/);
      if (parts[0]) {
        const val = parts[0].replace(/NIP\.\s*/gi, "").replace(/[\[\]]/g, "").trim();
        if (val && val !== "[NIP Pimpinan]" && !val.includes("NIP Pimpinan")) nipPimpinan = val;
      }
      if (parts[1]) {
        const val = parts[1].replace(/NIP\.\s*/gi, "").replace(/[\[\]]/g, "").trim();
        if (val && val !== "[NIP Notulen]" && !val.includes("NIP Notulen")) nipNotulen = val;
      }
    }
  }

  // Extract peserta count or line
  let pesertaLine = ".....................";
  const pLine = lines.find(l => l.includes("Peserta Rapat"));
  if (pLine) {
    pesertaLine = pLine.split(":")[1]?.trim() || pesertaLine;
  }

  // Create document elements
  const children: any[] = [];

  const addTextHeader = (targetArray: any[]) => {
    targetArray.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "MAHKAMAH AGUNG REPUBLIK INDONESIA", bold: true, font: "Arial", size: 28 }), // 14pt
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "DIREKTORAT JENDERAL BADAN PERADILAN AGAMA", bold: true, font: "Arial", size: 24 }), // 12pt
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "PENGADILAN TINGGI AGAMA JAYAPURA", bold: true, font: "Arial", size: 24 }), // 12pt
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "PENGADILAN AGAMA PANIAI", bold: true, font: "Arial", size: 28 }), // 14pt
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Kompleks Kantor Bupati Paniai, Paniai Timur, Paniai, Telp. 085244544676", font: "Arial", size: 18, italics: true }), // 9pt
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "www.pa-paniai.go.id, pengadilan.agama.paniai@gmail.com", font: "Arial", size: 18, italics: true }), // 9pt
        ],
      }),
      // Double Border divider (represented by horizontal line)
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

  // --- HEADER INSTANSI ---
  let hasKopSuratImg = false;
  try {
    const kopSuratPath = path.join(process.cwd(), "kop surat.png");
    if (fs.existsSync(kopSuratPath)) {
      const stats = fs.statSync(kopSuratPath);
      if (stats.size > 0) {
        hasKopSuratImg = true;
      }
    }
  } catch (err) {
    console.error("Gagal memeriksa kop surat.png untuk DOCX:", err);
  }

  if (hasKopSuratImg) {
    try {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: fs.readFileSync(path.join(process.cwd(), "kop surat.png")),
              transformation: {
                width: 600, // 600px wide
                height: 110, // Proportional height
              },
            } as any),
          ],
          spacing: { after: 300 },
        })
      );
    } catch (docxImgErr) {
      console.error("Gagal memasukkan gambar ke DOCX, fallback ke teks:", docxImgErr);
      addTextHeader(children);
    }
  } else {
    addTextHeader(children);
  }

  // --- TITLE ---
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "NOTULEN RAPAT", bold: true, font: "Arial", size: 32 }), // 16pt
      ],
      spacing: { after: 200 },
    })
  );

  // --- BUILD THE UNIFIED SPREADSHEET TABLE ---
  const tableRows: TableRow[] = [];

  // Row 1: NOTULEN RAPAT
  tableRows.push(
    new TableRow({
      children: [
        createCell({
          text: "NOTULEN RAPAT",
          bold: true,
          fontSize: 24,
          columnSpan: 4,
          widthPct: 100,
        }),
      ],
    })
  );

  // Row 2: Metadata Headers
  tableRows.push(
    new TableRow({
      children: [
        createCell({ text: "Kode Dokumen", isHeader: true, bold: true, widthPct: 25 }),
        createCell({ text: "Tgl. Pembuatan", isHeader: true, bold: true, widthPct: 25 }),
        createCell({ text: "Tgl. Revisi", isHeader: true, bold: true, widthPct: 25 }),
        createCell({ text: "Tgl. Efektif", isHeader: true, bold: true, widthPct: 25 }),
      ],
    })
  );

  // Row 3: Metadata Values
  tableRows.push(
    new TableRow({
      children: [
        createCell({ text: "FM/AM/04/02", widthPct: 25 }),
        createCell({ text: "02/05/2018", widthPct: 25 }),
        createCell({ text: ".....................", widthPct: 25 }),
        createCell({ text: "02/05/2018", widthPct: 25 }),
      ],
    })
  );

  // Row 4: Hari/Tanggal/Jam
  tableRows.push(
    new TableRow({
      children: [
        createCell({ text: "Hari/Tanggal/Jam", bold: true, alignment: AlignmentType.LEFT, widthPct: 25, shadingColor: "F9F9F9" }),
        createCell({ text: hariTanggalJam, alignment: AlignmentType.LEFT, columnSpan: 3, widthPct: 75 }),
      ],
    })
  );

  // Row 5: Tempat
  tableRows.push(
    new TableRow({
      children: [
        createCell({ text: "Tempat", bold: true, alignment: AlignmentType.LEFT, widthPct: 25, shadingColor: "F9F9F9" }),
        createCell({ text: tempat, alignment: AlignmentType.LEFT, columnSpan: 3, widthPct: 75 }),
      ],
    })
  );

  // Row 6: Pimpinan Rapat
  tableRows.push(
    new TableRow({
      children: [
        createCell({ text: "Pimpinan Rapat", bold: true, alignment: AlignmentType.LEFT, widthPct: 25, shadingColor: "F9F9F9" }),
        createCell({ text: pimpinanRapat, bold: true, alignment: AlignmentType.LEFT, columnSpan: 3, widthPct: 75 }),
      ],
    })
  );

  // Row 7: Peserta Rapat
  tableRows.push(
    new TableRow({
      children: [
        createCell({ text: "Peserta Rapat", bold: true, alignment: AlignmentType.LEFT, widthPct: 25, shadingColor: "F9F9F9" }),
        createCell({ text: pesertaLine, alignment: AlignmentType.LEFT, columnSpan: 3, widthPct: 75 }),
      ],
    })
  );

  // Row 8: Agenda Rapat Header
  tableRows.push(
    new TableRow({
      children: [
        createCell({
          text: "Agenda Rapat",
          bold: true,
          isHeader: true,
          fontSize: 22,
          columnSpan: 4,
          widthPct: 100,
        }),
      ],
    })
  );

  // Row 9: Large Content Cell (The continuous body text)
  const agendaParagraphs: Paragraph[] = [];
  agendaRows.forEach((row) => {
    const trimmed = row.trim();
    if (!trimmed) {
      agendaParagraphs.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
    } else {
      const isListItem = /^\d+[\.\s]/.test(trimmed);
      agendaParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: row,
              font: "Arial",
              size: 22,
            }),
          ],
          indent: isListItem ? { left: 360 } : undefined, // Indent for items
          spacing: { after: 120 },
        })
      );
    }
  });

  // Fallback if empty
  if (agendaParagraphs.length === 0) {
    agendaParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Belum ada agenda rapat yang dimasukkan.",
            font: "Arial",
            size: 22,
            italics: true,
          }),
        ],
      })
    );
  }

  tableRows.push(
    new TableRow({
      children: [
        createCell({
          paragraphs: agendaParagraphs,
          alignment: AlignmentType.LEFT,
          columnSpan: 4,
          widthPct: 100,
        }),
      ],
    })
  );

  // Row 10: Signatures
  const sigLeftParagraphs: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: "Mengetahui,", font: "Arial", size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: "Pimpinan Rapat", font: "Arial", size: 22, bold: true })] }),
    new Paragraph({ spacing: { before: 1200 } }), // gap
    new Paragraph({ children: [new TextRun({ text: pimpinanRapat, font: "Arial", size: 22, bold: true, underline: {} })] }),
    new Paragraph({ children: [new TextRun({ text: `NIP. ${nipPimpinan}`, font: "Arial", size: 20 })] }),
  ];

  const sigRightParagraphs: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: " ", font: "Arial", size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: "Notulen Rapat", font: "Arial", size: 22, bold: true })] }),
    new Paragraph({ spacing: { before: 1200 } }), // gap
    new Paragraph({ children: [new TextRun({ text: notulenRapat, font: "Arial", size: 22, bold: true, underline: {} })] }),
    new Paragraph({ children: [new TextRun({ text: `NIP. ${nipNotulen}`, font: "Arial", size: 20 })] }),
  ];

  tableRows.push(
    new TableRow({
      children: [
        createCell({
          paragraphs: sigLeftParagraphs,
          alignment: AlignmentType.LEFT,
          columnSpan: 2,
          widthPct: 50,
        }),
        createCell({
          paragraphs: sigRightParagraphs,
          alignment: AlignmentType.LEFT,
          columnSpan: 2,
          widthPct: 50,
        }),
      ],
    })
  );

  const mainTable = new Table({
    rows: tableRows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
  });

  children.push(mainTable);

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

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// Serve kop surat.png from root
app.get(["/kop surat.png", "/kop%20surat.png"], (req, res) => {
  const imagePath = path.join(process.cwd(), "kop surat.png");
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).send("File kop surat.png tidak ditemukan.");
  }
});

// Endpoint to generate resumable upload URL for Gemini File API (bypass Vercel 4.5MB limit)
app.post("/api/get-upload-url", async (req, res) => {
  try {
    const { fileSize, mimeType, displayName } = req.body;
    if (!fileSize || !mimeType) {
      return res.status(400).json({ error: "fileSize dan mimeType wajib disertakan." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY tidak dikonfigurasi di environment. Silakan tambahkan di Settings > Secrets.",
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
});

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

// Endpoint to validate public Google Drive audio links
app.post("/api/validate-drive-link", async (req, res) => {
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
    
    const contentLength = response.headers.get("content-length");
    const sizeMb = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) + " MB" : "Tidak diketahui";

    res.json({
      valid: true,
      fileId,
      fileName: originalname,
      fileSize: sizeMb,
      mimeType: mime || "audio/mpeg"
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Tautan Google Drive tidak valid atau tidak dapat diakses secara publik." });
  }
});

app.get("/api/kop-surat", (req, res) => {
  res.sendFile(path.join(process.cwd(), "kop surat.png"));
});

// Endpoint to stream/proxy file content from Google Drive to avoid CORS or antivirus page issues
app.get("/api/stream-drive", async (req, res) => {
  const fileId = req.query.id as string;
  if (!fileId) {
    return res.status(400).send("File ID is required");
  }
  try {
    const url = `https://docs.google.com/uc?export=download&id=${fileId}`;
    let driveRes = await fetch(url);
    const contentType = driveRes.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const text = await driveRes.text();
      const confirmMatch = text.match(/confirm=([a-zA-Z0-9-_]+)/);
      if (confirmMatch) {
        const confirmToken = confirmMatch[1];
        const confirmUrl = `https://docs.google.com/uc?export=download&confirm=${confirmToken}&id=${fileId}`;
        driveRes = await fetch(confirmUrl);
      }
    }
    
    res.setHeader("Content-Type", driveRes.headers.get("content-type") || "audio/mpeg");
    if (driveRes.headers.get("content-length")) {
      res.setHeader("Content-Length", driveRes.headers.get("content-length")!);
    }
    
    const arrayBuffer = await driveRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    res.status(500).send("Error streaming from Google Drive: " + err.message);
  }
});

// Post audio to Gemini for Transcription & Formatting
app.post("/api/process-audio", (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    next();
  } else {
    upload.single("audio")(req, res, (err) => {
      if (err) {
        const errMsg = `[${new Date().toISOString()}] Multer Upload Error: ${err.message}\n`;
        fs.appendFileSync(path.join(process.cwd(), "server.log"), errMsg);
        console.error("Gagal mengunggah berkas audio:", err);
        return res.status(400).json({ error: `Gagal mengunggah berkas audio: ${err.message}` });
      }
      next();
    });
  }
}, async (req, res) => {
  try {
    const contentType = req.headers["content-type"] || "";
    let fileUri = "";
    let mimeType = "";
    let base64Data = "";
    let realtimeTranscript = "";
    let isTextOnly = false;
    let summaryPoints = "";

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY tidak dikonfigurasi di environment. Silakan tambahkan di Settings > Secrets.",
      });
    }

    if (contentType.includes("application/json")) {
      isTextOnly = req.body.isTextOnly === "true" || req.body.isTextOnly === true;
      summaryPoints = req.body.summaryPoints || "";
      realtimeTranscript = req.body.realtimeTranscript || "";

      if (!isTextOnly) {
        const driveUrl = req.body.driveUrl;
        if (driveUrl) {
          const fileId = extractGoogleDriveFileId(driveUrl);
          if (!fileId) {
            return res.status(400).json({ error: "Format tautan Google Drive tidak valid. Pastikan tautan lengkap dan benar." });
          }
          console.log(`Mengunduh berkas dari Google Drive dengan ID: ${fileId}...`);
          try {
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
          } catch (driveErr: any) {
            console.error("Gagal mengunduh berkas Google Drive:", driveErr);
            return res.status(400).json({ error: driveErr.message || "Gagal mengunduh berkas dari Google Drive. Pastikan link dapat diakses secara publik." });
          }
        } else {
          fileUri = req.body.fileUri || "";
          mimeType = req.body.mimeType || "";
        }
      }
    } else {
      if (!req.file) {
        return res.status(400).json({ error: "File audio tidak ditemukan dalam request." });
      }
      mimeType = req.file.mimetype;
      base64Data = req.file.buffer.toString("base64");
      realtimeTranscript = req.body.realtimeTranscript || "";
      isTextOnly = req.body.isTextOnly === "true" || req.body.isTextOnly === true;
      summaryPoints = req.body.summaryPoints || "";
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

    const promptText = `
Anda adalah seorang Notulen Rapat Profesional di Pengadilan Agama Paniai. Tugas utama Anda adalah menyusun Notulensi Rapat Dinas yang EKSAT dan FAKTUAL berdasarkan file audio yang diunggah.

ATURAN KETAT (FORMAT & ANTI-HALUSINASI):
1. HANYA tulis informasi yang benar-benar diucapkan atau disebutkan di dalam rekaman audio.
2. JANGAN PERNAH menambahkan asumsi, kesimpulan logis sendiri, atau mengarang cerita/agenda yang tidak ada di dalam audio.
3. JANGAN gunakan karakter asterisk/bintang (* atau **) untuk menebalkan (bolding) kata atau untuk hal lain apa pun di seluruh dokumen. Tulis semuanya polos tanpa tanda bintang sama sekali.
4. Jika ada bagian format yang datanya tidak disebutkan di dalam audio (misalnya nama pimpinan atau jumlah peserta), tulis "Tidak disebutkan dalam rekaman" atau isi HANYA berdasarkan data tambahan yang diberikan oleh User pada kolom chat.
5. Gunakan nama-nama pejabat Pengadilan Agama Paniai berikut sebagai default jika tidak ada nama pimpinan/notulen lain yang disebutkan di dalam rapat atau instruksi user:
   - Pimpinan Rapat: Ahmad Muhtar, S.H.I (NIP. 198112122009121004)
   - Notulen Rapat: Idris Al Basyir, A.Md (NIP. 199601112025061004)
6. Tetap gunakan gaya bahasa formal (EYD V) untuk merangkum kalimat yang diucapkan pembicara, tanpa mengubah inti faktanya.

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
Pimpinan Rapat   : Ahmad Muhtar, S.H.I
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


Ahmad Muhtar, S.H.I                                 Idris Al Basyir, A.Md
NIP. 198112122009121004                             NIP. 199601112025061004
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

    // Call the Gemini 2.5-flash model (latest recommended multimodal model for audio) using lazy client
    const ai = getGeminiClient();
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
    res.json({ result: notulensiResult });
  } catch (error: any) {
    const errorLog = `[${new Date().toISOString()}] Gemini Error: ${error.message}\nStack: ${error.stack}\n`;
    try {
      fs.appendFileSync(path.join(process.cwd(), "server.log"), errorLog);
    } catch (e) {
      console.error(e);
    }
    console.error("Gagal memproses audio dengan Gemini:", error);
    res.status(500).json({ error: error.message || "Gagal memproses notulensi rapat." });
  }
});

// Endpoint to generate and export DOCX
app.post("/api/export-docx", async (req, res) => {
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
  } catch (error: any) {
    console.error("Gagal mengekspor DOCX:", error);
    res.status(500).json({ error: error.message || "Gagal mengekspor dokumen DOCX." });
  }
});

// Serve frontend assets in dev/production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
