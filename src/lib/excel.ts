import ExcelJS from "exceljs";
import type { Response } from "express";

export interface HojaExcel {
  nombre: string;
  columnas: { header: string; key: string; width?: number }[];
  filas: Record<string, unknown>[];
}

function escaparCelda(valor: unknown): unknown {
  if (typeof valor !== "string") return valor;
  if (/^[=+\-@]/.test(valor)) {
    return `"${valor}"`;
  }
  return valor;
}

export async function generarExcel(hojas: HojaExcel[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const hoja of hojas) {
    const sheet = workbook.addWorksheet(hoja.nombre);
    sheet.columns = hoja.columnas.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 22 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRows(hoja.filas.map((fila) => Object.fromEntries(Object.entries(fila).map(([k, v]) => [k, escaparCelda(v)]))));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function enviarExcel(res: Response, buffer: Buffer, filename: string): void {
  const safeFilename = filename.replace(/[^\w.-]/g, "_");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
  res.send(buffer);
}
