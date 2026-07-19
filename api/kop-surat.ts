import { Request, Response } from "express";
import path from "path";
import fs from "fs";

export default function handler(req: Request, res: Response) {
  const filePath = path.join(process.cwd(), "kop surat.png");
  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(fs.readFileSync(filePath));
  }
  res.status(404).send("Not Found");
}
