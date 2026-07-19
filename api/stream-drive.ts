import { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

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
}
