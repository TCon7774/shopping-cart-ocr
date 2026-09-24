import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { loadLocalEnv } from "./load-local-env.mjs";
import { extractTextFromImage } from "./vision-ocr.mjs";

const API_KEY_ENV = "GOOGLE_CLOUD_VISION_API_KEY";

function printUsage() {
  console.log(`
Usage:
  node ocr-grocery-list.mjs <path-to-image>

Examples:
  node ocr-grocery-list.mjs "C:\\Users\\you\\Pictures\\shopping-list.jpg"
  node ocr-grocery-list.mjs ./shopping-list.png

Setup:
  Set ${API_KEY_ENV} in your shell, or create a .env file:
  ${API_KEY_ENV}=your_google_cloud_vision_api_key
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const imagePath = args[0];
  return { imagePath };
}

async function main() {
  loadLocalEnv();

  const { help, imagePath } = parseArgs(process.argv);
  if (help) {
    printUsage();
    return;
  }

  if (!imagePath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const resolvedImagePath = resolve(imagePath);
  if (!existsSync(resolvedImagePath)) {
    console.error(`Image not found: ${resolvedImagePath}`);
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env[API_KEY_ENV];
  if (!apiKey) {
    console.error(`Missing ${API_KEY_ENV}. Add it to your shell environment or a local .env file.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Analyzing ${basename(resolvedImagePath)} with Google Cloud Vision OCR...\n`);

  const extractedText = await extractTextFromImage({
    apiKey,
    imagePath: resolvedImagePath,
  });

  if (!extractedText.trim()) {
    console.log("No text was detected.");
    return;
  }

  console.log("Extracted text:");
  console.log("---------------");
  console.log(extractedText.trim());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
