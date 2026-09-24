import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { DEFAULT_OPENAI_MODEL, OPENAI_MODEL_ENV, parseGroceryList } from "./grocery-list-parser.mjs";
import { loadLocalEnv } from "./load-local-env.mjs";

const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

const SAMPLE_TEXT = `2% Milk x1
18. eggs carton x2
Unsalted Butter x1
6-pack Gatorade x2
Cookie Dough x3
Hot Dog Bread x2
Hot dogs
frozen Lasagna x3`;

function printUsage() {
  console.log(`
Usage:
  node parse-grocery-list.mjs <path-to-text-file>
  node parse-grocery-list.mjs --sample
  node parse-grocery-list.mjs --text "2% Milk x1"

Examples:
  node parse-grocery-list.mjs .\\sample-grocery-list.txt
  node parse-grocery-list.mjs --sample

Setup:
  Add your OpenAI API key to .env:
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

  if (args[0] === "--sample") {
    return { groceryText: SAMPLE_TEXT, sourceName: "built-in sample" };
  }

  if (args[0] === "--text") {
    const groceryText = args.slice(1).join(" ").trim();
    return { groceryText, sourceName: "command line text" };
  }

  if (args[0]) {
    const textPath = resolve(args[0]);
    return { textPath, sourceName: basename(textPath) };
  }

  return {};
}

async function main() {
  loadLocalEnv();

  const { help, groceryText, textPath } = parseArgs(process.argv);
  if (help) {
    printUsage();
    return;
  }

  let inputText = groceryText;
  if (textPath) {
    if (!existsSync(textPath)) {
      console.error(`Text file not found: ${textPath}`);
      process.exitCode = 1;
      return;
    }

    inputText = readFileSync(textPath, "utf8");
  }

  if (!inputText?.trim()) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env[OPENAI_API_KEY_ENV];
  if (!apiKey) {
    console.error(`Missing ${OPENAI_API_KEY_ENV}. Add it to your local .env file.`);
    process.exitCode = 1;
    return;
  }

  const model = process.env[OPENAI_MODEL_ENV] || DEFAULT_OPENAI_MODEL;
  const items = await parseGroceryList({
    apiKey,
    model,
    groceryText: inputText,
  });

  console.log(JSON.stringify(items, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
