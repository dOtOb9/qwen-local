import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PDF_CHARS = 12000;
const ATTACHMENT_PREFIX = "[添付ファイル: ";

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }
  return pages.join("\n\n").trim();
}

export function buildAttachedFileMessage(
  filename: string,
  text: string,
  question: string,
): string {
  const truncated =
    text.length > MAX_PDF_CHARS
      ? text.slice(0, MAX_PDF_CHARS) + "\n...(以下省略)"
      : text;
  return `${ATTACHMENT_PREFIX}${filename}]\n\n${truncated}\n\n---\n${question}`;
}

export function parseAttachedFileMessage(
  content: string,
): { filename: string; question: string } | null {
  if (!content.startsWith(ATTACHMENT_PREFIX)) return null;
  const closeIdx = content.indexOf("]\n\n");
  const sepIdx = content.lastIndexOf("\n\n---\n");
  if (closeIdx === -1 || sepIdx === -1) return null;
  const filename = content.slice(ATTACHMENT_PREFIX.length, closeIdx);
  const question = content.slice(sepIdx + "\n\n---\n".length);
  return { filename, question };
}
