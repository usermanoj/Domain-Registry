import { strToU8, zipSync } from "fflate";
import type { DomainCheckResult, Recommendation } from "./types";

export type ExportRow = {
  domain: string;
  name: string;
  extension: string;
  status: string;
  confidence: string;
  provider: string;
  source: string;
  price: string;
  premium: string;
  checkedAt: string;
  brandScore: string;
  registrarUrl: string;
};

export function buildExportRows(
  results: DomainCheckResult[],
  recommendations: Recommendation[],
): ExportRow[] {
  const scoreByName = new Map(
    recommendations.map((recommendation) => [
      recommendation.name,
      recommendation.brandScore.toString(),
    ]),
  );

  return results.map((result) => ({
    domain: result.domain,
    name: result.name,
    extension: result.extension,
    status: result.status,
    confidence: result.confidence,
    provider: result.providerName,
    source: result.source,
    price: result.priceRegistration
      ? `${result.currency ?? ""} ${result.priceRegistration}`.trim()
      : "",
    premium: result.premium ? "yes" : "no",
    checkedAt: result.checkedAt,
    brandScore: scoreByName.get(result.name) ?? "",
    registrarUrl: result.registrarUrl ?? "",
  }));
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function toCsv(rows: ExportRow[]) {
  const headers = [
    "domain",
    "name",
    "extension",
    "status",
    "confidence",
    "provider",
    "source",
    "price",
    "premium",
    "checkedAt",
    "brandScore",
    "registrarUrl",
  ];

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header as keyof ExportRow])).join(","),
    ),
  ].join("\n");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number) {
  let column = "";
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - remainder - 1) / 26);
  }

  return column;
}

function worksheetXml(rows: ExportRow[]) {
  const headers = [
    "domain",
    "name",
    "extension",
    "status",
    "confidence",
    "provider",
    "source",
    "price",
    "premium",
    "checkedAt",
    "brandScore",
    "registrarUrl",
  ] as const;
  const table = [
    headers,
    ...rows.map((row) => headers.map((header) => row[header])),
  ];
  const lastColumn = columnName(headers.length - 1);
  const lastRow = Math.max(table.length, 1);
  const sheetData = table
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowNumber}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetData>${sheetData}</sheetData>
</worksheet>`;
}

export function toXlsxBuffer(rows: ExportRow[]) {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Domain Intelligence" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(rows)),
  };

  return zipSync(files, { level: 6 });
}
