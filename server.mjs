import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import { loadLocalEnv } from "./load-local-env.mjs";
import { extractTextFromImageContent } from "./vision-ocr.mjs";
import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_MODEL_ENV,
  parseGroceryList,
} from "./grocery-list-parser.mjs";
import { products } from "./src/data/products.js";
import { matchProduct } from "./src/utils/matchProduct.js";

const GOOGLE_API_KEY_ENV = "GOOGLE_CLOUD_VISION_API_KEY";
const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
const PORT = 5173;
const MAX_BODY_SIZE = 12 * 1024 * 1024;

loadLocalEnv();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("Image upload is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function getBase64Image(imageDataUrl) {
  if (typeof imageDataUrl !== "string" || !imageDataUrl.trim()) {
    throw new Error("Missing image data.");
  }

  const dataUrlMatch = imageDataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  return dataUrlMatch ? dataUrlMatch[1] : imageDataUrl;
}

async function handleImageImport(request, response) {
  const googleApiKey = process.env[GOOGLE_API_KEY_ENV];
  const openAiApiKey = process.env[OPENAI_API_KEY_ENV];

  if (!googleApiKey || !openAiApiKey) {
    sendJson(response, 500, {
      error: `Missing ${!googleApiKey ? GOOGLE_API_KEY_ENV : OPENAI_API_KEY_ENV} in .env.`,
    });
    return;
  }

  try {
    const { imageDataUrl, fileName } = await readJsonBody(request);
    const base64Image = getBase64Image(imageDataUrl);

    const extractedText = await extractTextFromImageContent({
      apiKey: googleApiKey,
      base64Image,
    });

    if (!extractedText.trim()) {
      sendJson(response, 200, {
        fileName,
        extractedText: "",
        parsedItems: [],
        matches: [],
        unmatched: [],
        message: "No text was detected in that image.",
      });
      return;
    }

    const parsedItems = await parseGroceryList({
      apiKey: openAiApiKey,
      model: process.env[OPENAI_MODEL_ENV] || DEFAULT_OPENAI_MODEL,
      groceryText: extractedText,
    });

    const matches = [];
    const unmatched = [];

    for (const aiItem of parsedItems) {
      const match = matchProduct(aiItem, products);

      if (!match) {
        unmatched.push(aiItem);
        continue;
      }

      matches.push({
        aiItem,
        product: match.product,
        score: match.score,
        quantity: aiItem.quantity,
      });
    }

    sendJson(response, 200, {
      fileName,
      extractedText,
      parsedItems,
      matches,
      unmatched,
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error.message,
    });
  }
}

const vite = await createViteServer({
  appType: "spa",
  server: {
    middlewareMode: true,
  },
});

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/import-grocery-image") {
    await handleImageImport(request, response);
    return;
  }

  vite.middlewares(request, response, () => {
    response.statusCode = 404;
    response.end("Not found");
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`FreshCart app and AI import API running at http://127.0.0.1:${PORT}/`);
});
