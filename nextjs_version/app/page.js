"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Upload,
  FileAudio,
  Copy,
  Check,
  RefreshCw,
  Scale,
  Sparkles,
  Download,
  AlertCircle,
  Clock,
  Trash2,
  FileText,
  Wand2,
  FileCode,
  Key,
  Eye,
  EyeOff
} from "lucide-react";
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

export default function Home() {
  const [inputMethod, setInputMethod] = useState("record"); // "record" | "upload" | "text"
  
  // Custom API Key States
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [isKeySaved, setIsKeySaved] = useState(false);

  // Load API Key from localStorage on Component Mount
  useEffect(() => {
    const savedKey = localStorage.getItem("user_gemini_api_key");
    if (savedKey) {
      setGeminiApiKey(savedKey);
      setIsKeySaved(true);
    }
  }, []);

  // Save/Update API Key
  const handleSaveApiKey = () => {
    if (geminiApiKey.trim()) {
      localStorage.setItem("user_gemini_api_key", geminiApiKey.trim());
      setIsKeySaved(true);
      setError(null);
    } else {
      localStorage.removeItem("user_gemini_api_key");
      setIsKeySaved(false);
    }
  };

  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [detectedDuration, setDetectedDuration] = useState(null);
  const [summaryPoints, setSummaryPoints] = useState(""); // For direct text processing
  
  // Core Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [resultMarkdown, setResultMarkdown] = useState("");
  const [executiveSummary, setExecutiveSummary] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [recordTime, setRecordTime] = useState(0);

  // Web Speech API States for Real-Time Dictation
  const [useRealtimeSpeech, setUseRealtimeSpeech] = useState(false);
  const [realtimeTranscript, setRealtimeTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const [vizHeights, setVizHeights] = useState(Array(15).fill(4));

  // Timer for direct microphone recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
        setVizHeights(Array(15).fill(0).map(() => Math.floor(Math.random() * 24) + 6));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setRecordTime(0);
      setVizHeights(Array(15).fill(4));
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // Web Speech API for real-time transcription
  useEffect(() => {
    if (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "id-ID";

      rec.onresult = (event) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript + " ";
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (final) {
          setRealtimeTranscript((prev) => prev + final);
        }
        setInterimTranscript(interim);
      };

      rec.onerror = (e) => {
        console.error("Speech recognition error:", e);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Control Web Speech API along with recording state
  useEffect(() => {
    if (isRecording && useRealtimeSpeech && recognitionRef.current) {
      try {
        setRealtimeTranscript("");
        setInterimTranscript("");
        recognitionRef.current.start();
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
      }
    } else if (!isRecording && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // Already stopped
      }
    }
  }, [isRecording, useRealtimeSpeech]);

  // Start direct mic recording
  const startRecording = async () => {
    setError(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedBlob(audioBlob);
        setRecordedUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setError("Gagal mengakses mikrofon. Silakan berikan izin mikrofon pada browser atau HP Anda.");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Handle uploaded file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setDetectedDuration(null);
      setError(null);

      // Detect audio duration using standard HTML5 Audio
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.src = url;
      audio.onloadedmetadata = () => {
        setDetectedDuration(audio.duration);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setDetectedDuration(null);
        URL.revokeObjectURL(url);
      };
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const clearAudio = () => {
    setSelectedFile(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setDetectedDuration(null);
    setRealtimeTranscript("");
    setInterimTranscript("");
    setSummaryPoints("");
  };

  // Core Processing Engine utilizing Google File API and Resumable Upload
  const handleProcessAudio = async () => {
    const isTextOnly = inputMethod === "text";
    const fileToProcess = inputMethod === "upload" ? selectedFile : recordedBlob;

    if (!isTextOnly && !fileToProcess) {
      setError(
        inputMethod === "upload"
          ? "Silakan pilih file audio rapat terlebih dahulu."
          : "Silakan rekam suara rapat terlebih dahulu."
      );
      return;
    }

    if (isTextOnly && !summaryPoints.trim()) {
      setError("Silakan masukkan catatan kasar atau draf rapat Anda terlebih dahulu.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResultMarkdown("");
    setExecutiveSummary(null);
    setProgressPercent(5);

    try {
      let notulensiResult = "";

      if (isTextOnly) {
        setProgressMessage("Mengirim data catatan rapat ke sistem AI...");
        setProgressPercent(40);

        const response = await fetch("/api/process-audio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(isKeySaved && geminiApiKey ? { "x-gemini-api-key": geminiApiKey.trim() } : {}),
          },
          body: JSON.stringify({
            isTextOnly: true,
            summaryPoints: summaryPoints,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          let parsedError = "";
          try {
            parsedError = JSON.parse(errText).error;
          } catch(e) {}
          throw new Error(parsedError || `Gagal menghubungi sistem AI: ${response.statusText}`);
        }

        const data = await response.json();
        notulensiResult = data.result || "";
        if (data.executiveSummary) {
          setExecutiveSummary(data.executiveSummary);
        }
      } else {
        // --- SECURE SERVER-SIDE AUDIO PROCESSING ARCHITECTURE ---
        const fileSizeMB = (fileToProcess.size / (1024 * 1024)).toFixed(1);
        setProgressMessage(`Mengunggah rekaman audio ke server (${fileSizeMB} MB)...`);
        setProgressPercent(10);

        const formData = new FormData();
        formData.append("audio", fileToProcess, fileToProcess.name || "audio.webm");
        formData.append("isTextOnly", "false");
        if (realtimeTranscript && realtimeTranscript.trim().length > 0) {
          formData.append("realtimeTranscript", realtimeTranscript);
        }

        const data = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/process-audio", true);

          if (isKeySaved && geminiApiKey) {
            xhr.setRequestHeader("x-gemini-api-key", geminiApiKey.trim());
          }

          // Track upload progress to our server
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.min(Math.round((event.loaded / event.total) * 60) + 10, 70); // scale up to 70%
              setProgressPercent(percent);
              setProgressMessage(`Mengunggah rekaman audio ke server (${fileSizeMB} MB) (${Math.round((event.loaded / event.total) * 100)}%)...`);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch (e) {
                resolve(xhr.responseText);
              }
            } else {
              let errorMsg = "Gagal memproses audio rapat.";
              try {
                const resJson = JSON.parse(xhr.responseText);
                errorMsg = resJson.error || errorMsg;
              } catch (e) {}
              reject(new Error(errorMsg));
            }
          };

          xhr.onerror = () => {
            reject(new Error("Terjadi galat jaringan saat mengunggah berkas ke server."));
          };

          xhr.send(formData);
        });

        setProgressMessage("Gemini sedang menganalisis suara & menyusun notulen rapat PA Paniai...");
        setProgressPercent(85);

        notulensiResult = data.result || "";
        if (data.executiveSummary) {
          setExecutiveSummary(data.executiveSummary);
        }
      }

      if (!notulensiResult) {
        throw new Error("Gemini tidak mengembalikan hasil teks. Silakan coba kembali.");
      }

      // Bersihkan karakter asterisks (*) yang mengganggu tata naskah
      notulensiResult = notulensiResult.replace(/\*/g, "");
      setResultMarkdown(notulensiResult);

      setProgressPercent(100);
      setProgressMessage("Penyusunan selesai!");
    } catch (err) {
      console.error(err);
      setError(err.message || "Terjadi galat koneksi atau kegagalan saat memproses berkas.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = () => {
    if (!resultMarkdown) return;
    navigator.clipboard.writeText(resultMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    if (!resultMarkdown) return;
    const blob = new Blob([resultMarkdown], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Notulensi_PA_Paniai.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pure Client-side styled Word DOCX exporter
  const handleDownloadDocx = async () => {
    if (!resultMarkdown) return;
    try {
      const lines = resultMarkdown.split("\n");

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

      // Parse signatures block
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
        const sigLines = lines.slice(signatureLineIndex).filter((l) => l.trim());
        const nameLines = sigLines.filter(
          (l) => l.trim() && !l.includes("Mengetahui") && !l.includes("Pimpinan Rapat") && !l.includes("Notulen Rapat") && !l.includes("NIP")
        );
        if (nameLines.length >= 1) {
          const parts = nameLines[0].split(/\s{3,}/);
          if (parts[0]) pimpinanRapat = parts[0].replace(/[\[\]]/g, "").trim();
          if (parts[1]) notulenRapat = parts[1].replace(/[\[\]]/g, "").trim();
        }
        const nipLines = sigLines.filter((l) => l.includes("NIP."));
        if (nipLines.length >= 1) {
          const parts = nipLines[0].split(/\s{3,}/);
          if (parts[0]) nipPimpinan = parts[0].replace(/NIP\.\s*/gi, "").replace(/[\[\]]/g, "").trim();
          if (parts[1]) nipNotulen = parts[1].replace(/NIP\.\s*/gi, "").replace(/[\[\]]/g, "").trim();
        }
      }

      const children = [];

      // Add text fallback kop surat function
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

      // Try fetching kop surat image from public assets
      let hasKopSuratImg = false;
      let kopBuffer = null;
      try {
        const kopRes = await fetch("/kop surat.png");
        if (kopRes.ok) {
          kopBuffer = await kopRes.arrayBuffer();
          hasKopSuratImg = true;
        }
      } catch (e) {
        console.warn("Kop surat gambar tidak terjangkau, menggunakan teks.", e);
      }

      if (hasKopSuratImg && kopBuffer) {
        try {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: kopBuffer,
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
      const pLine = lines.find((l) => l.includes("Peserta Rapat"));
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

      const docxBlob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(docxBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Notulensi_PA_Paniai.docx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      setError("Gagal mengekspor dokumen Word (.docx): " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfcf9] text-stone-800 flex flex-col font-sans selection:bg-emerald-100 selection:text-[#064e3b]">
      {/* HEADER BANNER */}
      <header className="bg-[#064e3b] text-[#fdfcf9] py-4 px-6 shadow-md border-b-2 border-[#d4af37] shrink-0">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 rounded-lg p-2 border border-white/20 shadow-inner">
              <Scale className="h-7 w-7 text-[#fdfcf9]" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold tracking-tight uppercase">
                Notulensi Rapat Otomatis <span className="text-xs font-normal lowercase italic text-emerald-300 ml-1 font-sans normal-case">by idris</span>
              </h1>
              <p className="text-[9px] md:text-xs uppercase tracking-wider opacity-90 font-medium">
                Pengadilan Agama Paniai • Mahkamah Agung RI
              </p>
            </div>
          </div>
          <div className="bg-emerald-950/40 px-3 py-1.5 rounded-full border border-emerald-500/20 text-[10px] md:text-xs text-emerald-300 font-bold self-start md:self-auto uppercase tracking-widest flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Dinas Resmi Secure Edition
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">

        {/* WELCOME INSTRUCTION */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4 md:p-5">
          <h2 className="text-sm font-bold text-stone-900 mb-1.5 flex items-center gap-2">
            ⚖️ Notulen Rapat Dinas Resmi PA Paniai
          </h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            Anda dapat merekam suara secara langsung, mengunggah berkas rekaman suara yang ada di memori internal HP/Laptop Anda (mendukung berkas berukuran besar hingga 100MB tanpa batasan hosting), atau memasukkan poin catatan rapat kasar secara tertulis untuk diterjemahkan menjadi format dinas resmi Pengadilan Agama Paniai.
          </p>
        </div>

        {/* CONTROLS AND FORMS */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
          {/* TABS */}
          <div className="flex border-b border-stone-100 bg-stone-50/50">
            <button
              onClick={() => { setInputMethod("record"); setError(null); }}
              className={`flex-1 py-3 text-center font-semibold text-xs uppercase tracking-wider border-b-2 flex items-center justify-center space-x-2 transition-all ${
                inputMethod === "record"
                  ? "border-[#064e3b] text-[#064e3b] bg-white font-bold"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
              <span>Rekam Suara</span>
            </button>
            <button
              onClick={() => { setInputMethod("upload"); setError(null); }}
              className={`flex-1 py-3 text-center font-semibold text-xs uppercase tracking-wider border-b-2 flex items-center justify-center space-x-2 transition-all ${
                inputMethod === "upload"
                  ? "border-[#064e3b] text-[#064e3b] bg-white font-bold"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Unggah Berkas</span>
            </button>
            <button
              onClick={() => { setInputMethod("text"); setError(null); }}
              className={`flex-1 py-3 text-center font-semibold text-xs uppercase tracking-wider border-b-2 flex items-center justify-center space-x-2 transition-all ${
                inputMethod === "text"
                  ? "border-[#064e3b] text-[#064e3b] bg-white font-bold"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>Catatan Rapat</span>
            </button>
          </div>

          <div className="p-4 md:p-6">
            {/* RECORD CARD */}
            {inputMethod === "record" && (
              <div className="space-y-4">
                <div className="max-w-md mx-auto p-5 bg-stone-50/50 border border-stone-200 rounded-xl text-center">
                  {isRecording ? (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <button
                        onClick={stopRecording}
                        className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md animate-pulse active:scale-95 transition-all"
                      >
                        <Square className="h-5 w-5" />
                      </button>
                      <div>
                        <span className="text-xs font-bold text-red-600 uppercase tracking-widest block mb-1">REKAMPAD AKTIF</span>
                        <div className="flex items-center justify-center space-x-1 h-8 w-full mb-2">
                          {vizHeights.map((h, i) => (
                            <span
                              key={i}
                              className="w-1 rounded-full bg-emerald-600 transition-all duration-150"
                              style={{ height: `${h / 2}px` }}
                            ></span>
                          ))}
                        </div>
                        <span className="text-2xl font-mono font-bold text-stone-800">{formatTime(recordTime)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <button
                        onClick={startRecording}
                        className="h-16 w-16 rounded-full bg-[#064e3b] hover:bg-emerald-900 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
                      >
                        <Mic className="h-6 w-6" />
                      </button>
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">Klik tombol untuk mulai merekam</span>
                        <span className="text-[10px] text-stone-400 mt-0.5 block font-medium">Format audio webm aman & didukung peramban</span>
                      </div>
                    </div>
                  )}

                  {/* Speech to text dictation toggle */}
                  {!isRecording && (
                    <div className="mt-4 flex items-center gap-3 bg-white p-3 border border-stone-200 rounded-lg text-left w-full shadow-sm">
                      <input
                        type="checkbox"
                        id="use-realtime-speech-v2"
                        checked={useRealtimeSpeech}
                        onChange={(e) => setUseRealtimeSpeech(e.target.checked)}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-stone-300 rounded cursor-pointer"
                      />
                      <label htmlFor="use-realtime-speech-v2" className="text-xs text-stone-700 font-medium cursor-pointer select-none flex-1">
                        <span className="font-bold text-[#064e3b]">Transkripsi Real-Time (Web Speech)</span>
                        <p className="text-[10px] text-stone-500 mt-0.5 font-normal leading-tight">
                          Diktekan teks langsung di layar saat Anda sedang berbicara di rapat untuk meningkatkan presisi.
                        </p>
                      </label>
                    </div>
                  )}

                  {recordedUrl && !isRecording && (
                    <div className="mt-4 w-full bg-white p-3 border border-stone-200 rounded-lg text-left shadow-sm">
                      <span className="text-xs text-stone-500 block mb-2 font-medium">Hasil Rekaman Suara Anda:</span>
                      <audio src={recordedUrl} controls className="w-full h-10" />
                    </div>
                  )}

                  {(realtimeTranscript || interimTranscript) && (
                    <div className="mt-4 text-left bg-[#f4f7f6] border border-[#d1dbd8] rounded-lg p-3 w-full">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-[#064e3b] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Teks Transkripsi Real-Time {isRecording ? "(Mendengarkan...)" : "(Selesai)"}:
                        </span>
                        {realtimeTranscript && !isRecording && (
                          <button
                            onClick={() => {
                              setRealtimeTranscript("");
                              setInterimTranscript("");
                            }}
                            className="text-stone-400 hover:text-stone-600 text-[10px] font-bold"
                          >
                            Reset Teks
                          </button>
                        )}
                      </div>
                      <div className="text-xs font-mono text-stone-800 leading-relaxed max-h-32 overflow-y-auto bg-white p-2 border border-stone-200 rounded-md whitespace-pre-wrap">
                        {realtimeTranscript}
                        {interimTranscript && (
                          <span className="text-emerald-600 font-bold italic font-sans"> {interimTranscript}...</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* UPLOAD FILE CARD */}
            {inputMethod === "upload" && (
              <div className="space-y-4">
                <div className="max-w-md mx-auto">
                  <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-stone-300 rounded-xl bg-stone-50 hover:bg-stone-100/50 cursor-pointer transition-all p-4 text-center group">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="p-2.5 bg-white rounded-full shadow border border-stone-200 text-stone-500 group-hover:text-emerald-800 transition-all">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-stone-700">
                        {selectedFile ? selectedFile.name : "Klik atau seret berkas rekaman suara Anda kesini"}
                      </p>
                      <p className="text-[10px] text-stone-400">
                        Mendukung MP3, WAV, M4A, AAC, atau WebM (Hingga 100MB)
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isProcessing}
                    />
                  </label>

                  {selectedFile && (
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <span className="text-xs bg-emerald-50 text-emerald-800 font-mono py-1 px-2.5 rounded-full border border-emerald-200 flex items-center gap-1.5 shadow-sm">
                        <Clock className="h-3.5 w-3.5 text-emerald-600" />
                        Durasi: {detectedDuration !== null ? formatTime(Math.round(detectedDuration)) : "Mendeteksi..."}
                      </span>
                      <span className="text-xs bg-stone-100 text-stone-700 font-mono py-1 px-2.5 rounded-full border border-stone-200 inline-block shadow-sm">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DIRECT TEXT INPUT CARD */}
            {inputMethod === "text" && (
              <div className="space-y-3 max-w-lg mx-auto">
                <span className="text-xs text-stone-600 font-bold block">Poin-Poin atau Catatan Kasar Rapat:</span>
                <textarea
                  value={summaryPoints}
                  onChange={(e) => setSummaryPoints(e.target.value)}
                  placeholder="Contoh: Hari Senin 17 Juli, dipimpin Ketua Ahmad Muhtar. Agenda evaluasi PPNPN. Kesimpulan: Evaluasi harus selesai sebelum tanggal 25. Subbagian kepegawaian bertanggung jawab..."
                  className="w-full text-xs font-mono p-3 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#064e3b] min-h-[140px] bg-stone-50/20"
                ></textarea>
                <p className="text-[10px] text-stone-400 font-medium">
                  *Poin-poin di atas akan diformulasikan ke format dinas resmi lengkap dengan penomoran, EYD V, dan detail profesional secara instan.
                </p>
              </div>
            )}

            {/* RESET INPUT AND FILE TRIGGER */}
            {((inputMethod === "upload" && selectedFile) || (inputMethod === "record" && recordedBlob) || (inputMethod === "text" && summaryPoints)) && (
              <div className="max-w-md mx-auto mt-4">
                <button
                  onClick={clearAudio}
                  disabled={isProcessing}
                  className="w-full py-2 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus & Reset Masukan
                </button>
              </div>
            )}

            {/* PROCESS TRIGGER */}
            <div className="mt-5 max-w-md mx-auto">
              <button
                onClick={handleProcessAudio}
                disabled={isProcessing || (inputMethod === "record" && !recordedBlob) || (inputMethod === "upload" && !selectedFile) || (inputMethod === "text" && !summaryPoints.trim())}
                className="w-full bg-[#064e3b] hover:bg-emerald-900 text-white py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase disabled:opacity-40 transition-all flex items-center justify-center space-x-2 shadow"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>SEDANG MEMROSES...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>SUSUN NOTULENSI DINAS</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        
        {/* API Key Configuration Block */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-5 max-w-xl mx-auto">
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="w-full flex items-center justify-between text-left font-semibold text-stone-900 text-xs md:text-sm"
          >
            <span className="flex items-center gap-2">
              <Key className="h-4 w-4 text-[#064e3b]" />
              🔐 Pengaturan API Key {isKeySaved && "• Aktif"}
            </span>
            <span className="text-stone-400 hover:text-stone-600 font-bold font-mono">
              {showApiKey ? "[-]" : "[+]"}
            </span>
          </button>
          
          {showApiKey && (
            <div className="mt-4 pt-3.5 border-t border-stone-100 flex flex-col gap-3 font-sans">
              <p className="text-stone-600 text-xs leading-relaxed">
                Gunakan Kunci API Gemini Anda dari Google AI Studio sendiri untuk memproses berkas audio besar <strong>&gt;4.2MB (hingga 100MB)</strong> secara langsung dan aman dari browser Anda (Zero-Backend). Kunci Anda disimpan lokal di browser.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKeyInput ? "text" : "password"}
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="Masukkan AI Studio API Key..."
                    className="w-full text-xs bg-stone-50 border border-stone-300 rounded-lg py-2 pl-3.5 pr-10 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-stone-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                    className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
                  >
                    {showApiKeyInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  onClick={handleSaveApiKey}
                  className="py-2 px-4 bg-[#064e3b] text-white hover:bg-[#043d2e] rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  Simpan
                </button>
              </div>
              {isKeySaved && (
                <p className="text-emerald-700 text-[10px] font-bold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Kunci terpasang di browser Anda. Mode Zero-Backend aktif untuk semua pengolahan.
                </p>
              )}
            </div>
          )}
        </div>

        {/* LOADING PROGRESS BOX (HIGHLY VISIBLE) */}
        {isProcessing && (
          <div className="p-6 bg-white border border-stone-200 rounded-xl text-center space-y-4 max-w-md mx-auto shadow-md">
            <div className="relative mb-2 flex flex-col items-center">
              {/* Spinner */}
              <div className="h-16 w-16 rounded-full border-4 border-stone-100 border-t-[#064e3b] animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-[#064e3b]">
                {progressPercent}%
              </span>
            </div>
            <div>
              <h3 className="text-xs font-bold text-stone-900">Proses Pengecekan AI Sedang Berjalan</h3>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest mt-0.5">Mohon tunggu beberapa saat</p>
            </div>
            
            {/* Real Progress Bar */}
            <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden border border-stone-200 shadow-inner">
              <div 
                className="bg-gradient-to-r from-emerald-600 to-[#064e3b] h-full rounded-full transition-all duration-300" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            
            {/* Progress Label / State */}
            <div className="bg-[#fcfbf9] border border-[#d2dfd8] rounded-lg p-3">
              <p className="text-xs text-[#064e3b] font-semibold italic">"{progressMessage}"</p>
            </div>
          </div>
        )}

        {/* ERROR DISPLAY */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-start space-x-2 max-w-md mx-auto">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Gagal Memproses Notulensi</p>
              <p className="text-stone-600 mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* SUCCESS OUTPUT */}
        {resultMarkdown && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left/Main Column: Paper Document Preview */}
            <div className="lg:col-span-8 space-y-4 w-full">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-[11px] font-bold text-[#064e3b] uppercase tracking-wider flex items-center space-x-1.5">
                  <Sparkles className="h-4 w-4" />
                  <span>Notulensi Rapat Berhasil Disusun!</span>
                </span>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1.5 text-stone-700 bg-white border border-stone-200 rounded-lg text-[11px] font-semibold hover:bg-stone-50 shadow-sm flex items-center space-x-1"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-stone-500" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownloadTxt}
                    className="px-3 py-1.5 text-stone-700 bg-white border border-stone-200 rounded-lg text-[11px] font-semibold hover:bg-stone-50 shadow-sm flex items-center space-x-1"
                  >
                    <FileText className="h-3.5 w-3.5 text-stone-500" />
                    <span>TXT</span>
                  </button>
                  <button
                    onClick={handleDownloadDocx}
                    className="px-3 py-1.5 text-white bg-stone-800 hover:bg-black rounded-lg text-[11px] font-semibold shadow-sm flex items-center space-x-1"
                  >
                    <Download className="h-3.5 w-3.5 text-stone-300" />
                    <span>Download Word (.docx)</span>
                  </button>
                </div>
              </div>

              {/* TEXTAREA CONTAINER AND PREVIEW */}
              <div className="bg-white shadow border border-stone-200 rounded-md overflow-hidden flex flex-col">
                <div className="bg-stone-50 border-b border-stone-200 px-4 py-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Lembar Notulen Kasar Editor</span>
                  <span className="text-[10px] text-stone-400 italic">Dapat diedit langsung sebelum disalin</span>
                </div>
                <textarea
                  value={resultMarkdown}
                  onChange={(e) => setResultMarkdown(e.target.value)}
                  className="w-full text-xs font-mono p-4 min-h-[300px] border-none focus:outline-none text-stone-800 bg-[#fdfbf7] leading-relaxed resize-y select-text"
                ></textarea>
              </div>

              {/* PAPER PREVIEW */}
              <div className="bg-white shadow border border-stone-200 rounded-md p-6 md:p-10 font-serif text-stone-800 leading-relaxed w-full mx-auto relative select-text">
                <div className="text-center border-b-2 border-stone-800 pb-3 mb-4 select-none">
                  <h2 className="text-xs md:text-sm font-bold uppercase">MAHKAMAH AGUNG REPUBLIK INDONESIA</h2>
                  <h3 className="text-[10px] md:text-xs font-bold uppercase mt-0.5">DIREKTORAT JENDERAL BADAN PERADILAN AGAMA</h3>
                  <h3 className="text-[10px] md:text-xs font-bold uppercase mt-0.5">PENGADILAN TINGGI AGAMA JAYAPURA</h3>
                  <h1 className="text-xs md:text-sm font-bold uppercase mt-0.5">PENGADILAN AGAMA PANIAI</h1>
                  <p className="text-[9px] font-sans text-stone-500 italic mt-1">
                    Kompleks Kantor Bupati Paniai, Paniai Timur, Paniai, Telp. 085244544676
                  </p>
                  <p className="text-[9px] font-sans text-stone-500 italic">
                    www.pa-paniai.go.id, pengadilan.agama.paniai@gmail.com
                  </p>
                </div>
                <div className="prose prose-stone max-w-none text-xs font-sans whitespace-pre-wrap leading-relaxed">
                  {resultMarkdown}
                </div>
              </div>
            </div>

            {/* Right Column: Executive Summary AI Card */}
            <div className="lg:col-span-4 w-full">
              {executiveSummary ? (
                <div className="bg-white rounded-xl shadow-sm border border-stone-200 border-t-4 border-[#d4af37] p-5 lg:sticky lg:top-6 space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 mb-2 border-b border-stone-100">
                    <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                      <Wand2 className="h-4.5 w-4.5 text-emerald-700" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                        Ringkasan Eksekutif
                      </h4>
                      <p className="text-[10px] text-stone-500 font-sans">
                        3 Keputusan Utama Rapat
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {executiveSummary.map((point, index) => (
                      <div key={index} className="flex gap-3 items-start">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center text-[10px] font-bold font-mono">
                          {index + 1}
                        </span>
                        <p className="text-stone-700 text-xs leading-relaxed font-sans font-medium">
                          {point}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400 font-sans font-medium">
                    <span>Sistem Otomatis</span>
                    <span>EYD V Terverifikasi</span>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-5 text-center">
                  <p className="text-xs text-stone-400 italic font-medium">
                    Ringkasan Eksekutif (3 Keputusan Utama) akan ditampilkan di sini setelah dokumen selesai disusun oleh Gemini.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-stone-900 text-stone-400 py-4 text-center text-[11px] mt-10 border-t border-stone-800">
        <p>© {new Date().getFullYear()} Pengadilan Agama Paniai. Hak Cipta Dilindungi.</p>
        <p className="text-stone-600 mt-0.5">Sistem Notulensi Otomatis didukung oleh Google Gemini (Client-Side Resumable API)</p>
      </footer>
    </div>
  );
}
