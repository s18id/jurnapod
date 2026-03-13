// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export function parseDelimited(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;

  let delimiter = ",";
  if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = "\t";
  } else if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ";";
  }

  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    cells.push(current.trim());
    return cells;
  });
}

export function parseImportBoolean(value: string): boolean | null {
  const v = value.toLowerCase().trim();
  if (v === "" || v === "true" || v === "1" || v === "yes" || v === "y" || v === "aktif" || v === "active") {
    return true;
  }
  if (v === "false" || v === "0" || v === "no" || v === "n" || v === "nonaktif" || v === "inactive") {
    return false;
  }
  return null;
}

export async function readImportFile(file: File | null): Promise<string> {
  if (!file) return "";
  return file.text();
}
