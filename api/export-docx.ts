import { Request, Response } from "express";
import fs from "fs";
import path from "path";
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
  ImageRun
} from "docx";

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

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

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
    return res.send(docxBuffer);
  } catch (error: any) {
    console.error("Gagal mengekspor DOCX:", error);
    return res.status(500).json({ error: error.message || "Gagal mengekspor dokumen DOCX." });
  }
}
