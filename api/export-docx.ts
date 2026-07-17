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

// Helper for docx table cell with vertical alignment and styling
function createStyledCell(text: string, isHeader = false, widthPct = 25): TableCell {
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

// Function to convert Markdown to a professional DOCX Document
async function generateDocxBuffer(markdown: string): Promise<Buffer> {
  // Parse the markdown lines and extract details
  const cleanMd = markdown.replace(/\*/g, "");
  const lines = cleanMd.split("\n");

  // Default values
  let pimpinanRapat = "Pimpinan Rapat/Ketua";
  let notulenRapat = "Sekretaris/Notulen";
  let nipPimpinan = ".....................";
  let nipNotulen = ".....................";
  let hariTanggalJam = ".....................";
  let tempat = "Ruang Rapat Pengadilan Agama Paniai";
  let agendaRows: string[] = [];
  let kesimpulanRows: string[] = [];
  let state: "none" | "agenda" | "kesimpulan" = "none";

  // Quick extract patterns
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Hari/Tanggal/Jam")) {
      hariTanggalJam = trimmed.split(":")[1]?.trim() || hariTanggalJam;
    } else if (trimmed.startsWith("Tempat")) {
      tempat = trimmed.split(":")[1]?.trim() || tempat;
    } else if (trimmed.startsWith("Pimpinan Rapat")) {
      pimpinanRapat = trimmed.split(":")[1]?.trim() || pimpinanRapat;
    } else if (trimmed.includes("NIP.") || trimmed.toLowerCase().includes("nip")) {
      // Try to find NIPs
      const match = trimmed.match(/NIP\.\s*([\d\s\.\-]+)/gi);
      if (match) {
        // Just extract the numeric/text part
        // We'll parse signature names and NIPs in a separate pass or keep them default
      }
    }

    // Capture sections
    if (trimmed.toLowerCase().includes("agenda rapat")) {
      state = "agenda";
      continue;
    } else if (trimmed.toLowerCase().includes("kesimpulan rapat") || trimmed.toLowerCase().includes("kesimpulan rapat sebagai berikut") || trimmed.toLowerCase().includes("kesimpulan / keputusan")) {
      state = "kesimpulan";
      continue;
    } else if (trimmed.toLowerCase().includes("mengetahui") || (trimmed.toLowerCase().includes("pimpinan rapat") && trimmed.toLowerCase().includes("notulen rapat"))) {
      state = "none";
    }

    const isDivider = /^[=\-\s|_:|…]*$/.test(trimmed) || trimmed === "";
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

  // Double check signatures block
  // Let's find the names at the bottom of markdown
  let signatureLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("Mengetahui") || lines[i].trim().includes("Pimpinan Rapat") && lines[i].trim().includes("Notulen Rapat")) {
      signatureLineIndex = i;
    }
  }

  if (signatureLineIndex !== -1) {
    const sigLines = lines.slice(signatureLineIndex).filter(l => l.trim());
    const nameLines = sigLines.filter(l => l.trim() && !l.includes("Mengetahui") && !l.includes("Pimpinan Rapat") && !l.includes("Notulen Rapat") && !l.includes("NIP"));
    if (nameLines.length >= 1) {
      const parts = nameLines[0].split(/\s{3,}/); // Split by 3 or more spaces
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
  let finalKopSuratPath = "";
  const possiblePaths = [
    path.join(process.cwd(), "kop surat.png"),
    path.join(__dirname, "..", "kop surat.png"),
    path.join(__dirname, "kop surat.png"),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const stats = fs.statSync(p);
        if (stats.size > 0) {
          hasKopSuratImg = true;
          finalKopSuratPath = p;
          break;
        }
      }
    } catch (err) {
      console.error(`Gagal memeriksa path ${p}:`, err);
    }
  }

  if (hasKopSuratImg && finalKopSuratPath) {
    try {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: fs.readFileSync(finalKopSuratPath),
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

  // --- METADATA TABLE ---
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

  // --- DETAILS ---
  const addDetailLine = (label: string, value: string) => {
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

  // Find peserta count or raw line
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

  // --- AGENDA RAPAT SECTION ---
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Agenda Rapat", bold: true, font: "Arial", size: 24 }),
      ],
      spacing: { after: 200 },
    })
  );

  // Add agenda rows
  if (agendaRows.length > 0) {
    for (const row of agendaRows) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: row, font: "Arial", size: 22 }),
          ],
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

  // --- KESIMPULAN RAPAT SECTION ---
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
          children: [
            new TextRun({ text: row, font: "Arial", size: 22 }),
          ],
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

  // --- SIGNATURES ---
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Mengetahui,", font: "Arial", size: 22 }),
      ],
      spacing: { after: 100 },
    })
  );

  // Signatures Table (borderless for perfect layout)
  const signaturesTable = new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Pimpinan Rapat", bold: true, font: "Arial", size: 22 })],
              }),
              new Paragraph({ spacing: { before: 1200 } }), // Signature gap
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
              new Paragraph({ spacing: { before: 1200 } }), // Signature gap
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
