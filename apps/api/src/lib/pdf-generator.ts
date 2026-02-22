import puppeteer from "puppeteer-core";

type PdfOptions = {
  format?: "A4" | "Letter";
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  printBackground?: boolean;
};

const DEFAULT_PDF_OPTIONS: PdfOptions = {
  format: "A4",
  margin: {
    top: "10mm",
    right: "10mm",
    bottom: "10mm",
    left: "10mm"
  },
  printBackground: true
};

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  // Try to find Chrome/Chromium on the system
  const possiblePaths = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
    process.env.PUPPETEER_EXECUTABLE_PATH || ""
  ].filter(Boolean);

  let executablePath: string | undefined;
  
  for (const path of possiblePaths) {
    try {
      const fs = await import("fs");
      if (fs.existsSync(path)) {
        executablePath = path;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!executablePath) {
    throw new Error(
      "Chrome/Chromium not found. Please install chromium-browser or set PUPPETEER_EXECUTABLE_PATH environment variable."
    );
  }

  browserInstance = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  return browserInstance;
}

export async function generatePdfFromHtml(
  html: string,
  options: PdfOptions = {}
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, {
      waitUntil: "networkidle0"
    });

    const pdfBuffer = await page.pdf({
      format: options.format ?? DEFAULT_PDF_OPTIONS.format,
      margin: options.margin ?? DEFAULT_PDF_OPTIONS.margin,
      printBackground: options.printBackground ?? DEFAULT_PDF_OPTIONS.printBackground
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// Cleanup on process exit
if (typeof process !== "undefined") {
  process.on("exit", () => {
    closeBrowser().catch(console.error);
  });

  process.on("SIGINT", () => {
    closeBrowser()
      .catch(console.error)
      .finally(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    closeBrowser()
      .catch(console.error)
      .finally(() => process.exit(0));
  });
}
