import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { loadLocalEnv } from "./load-local-env.mjs";
import { parseGroceryList, DEFAULT_OPENAI_MODEL, OPENAI_MODEL_ENV } from "./grocery-list-parser.mjs";
import { extractTextFromImage } from "./vision-ocr.mjs";

const GOOGLE_API_KEY_ENV = "GOOGLE_CLOUD_VISION_API_KEY";
const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

function printUsage() {
  console.log(`
Usage:
  node analyze-grocery-image.mjs <path-to-image>

Example:
  node analyze-grocery-image.mjs "C:\\path\\to\\shopping-list.jpg"

Setup:
  Add both keys to your local .env file:
  ${GOOGLE_API_KEY_ENV}=your_google_cloud_vision_api_key
  ${OPENAI_API_KEY_ENV}=your_openai_api_key

Optional:
  ${OPENAI_MODEL_ENV}=${DEFAULT_OPENAI_MODEL}
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  return { imagePath: args[0] };
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

  const googleApiKey = process.env[GOOGLE_API_KEY_ENV];
  if (!googleApiKey) {
    console.error(`Missing ${GOOGLE_API_KEY_ENV}. Add it to your local .env file.`);
    process.exitCode = 1;
    return;
  }

  const openAiApiKey = process.env[OPENAI_API_KEY_ENV];
  if (!openAiApiKey) {
    console.error(`Missing ${OPENAI_API_KEY_ENV}. Add it to your local .env file.`);
    process.exitCode = 1;
    return;
  }

  console.error(`Reading ${basename(resolvedImagePath)} with Google Cloud Vision OCR...`);
  const extractedText = await extractTextFromImage({
    apiKey: googleApiKey,
    imagePath: resolvedImagePath,
  });

  if (!extractedText.trim()) {
    console.error("No text was detected.");
    console.log("[]");
    return;
  }

  console.error("Parsing grocery text into cart instructions with OpenAI...");
  const items = await parseGroceryList({
    apiKey: openAiApiKey,
    model: process.env[OPENAI_MODEL_ENV] || DEFAULT_OPENAI_MODEL,
    groceryText: extractedText,
  });

  console.log(JSON.stringify(items, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
