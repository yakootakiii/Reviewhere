import JSZip from "jszip";

/**
 * Test helpers that build real files rather than mocks, so the parsers are
 * exercised against actual PDF/OOXML bytes.
 */

/** A minimal but valid multi-page PDF with one text run per page. */
export function makePdf(pageTexts: string[]): Uint8Array {
  const objects: string[] = [];
  const pageCount = pageTexts.length;

  // 1 = Catalog, 2 = Pages, then per page: Page object, Contents stream.
  const pageIds = pageTexts.map((_, index) => 3 + index * 2);
  const fontId = 3 + pageCount * 2;

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );

  pageTexts.forEach((text, index) => {
    const contentId = pageIds[index] + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const escaped = text.replace(/([\\()])/g, "\\$1");
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

/** A .pptx containing the given slides, optionally with speaker notes. */
export async function makePptx(
  slides: { text: string[]; notes?: string[] }[],
): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
  );

  const body = (runs: string[]) =>
    runs
      .map(
        (run) =>
          `<p:sp><p:txBody><a:p><a:r><a:t>${run.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</a:t></a:r></a:p></p:txBody></p:sp>`,
      )
      .join("");

  slides.forEach((slide, index) => {
    zip.file(
      `ppt/slides/slide${index + 1}.xml`,
      `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${body(slide.text)}</p:spTree></p:cSld></p:sld>`,
    );
    if (slide.notes?.length) {
      zip.file(
        `ppt/notesSlides/notesSlide${index + 1}.xml`,
        `<?xml version="1.0"?><p:notes xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${body(slide.notes)}</p:spTree></p:cSld></p:notes>`,
      );
    }
  });

  return zip.generateAsync({ type: "uint8array" });
}
