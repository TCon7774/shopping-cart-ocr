import { readFileSync } from "node:fs";

const DEFAULT_FEATURE = "DOCUMENT_TEXT_DETECTION";
const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

export async function extractTextFromImage({ apiKey, imagePath }) {
  const imageBytes = readFileSync(imagePath);
  const base64Image = imageBytes.toString("base64");

  return extractTextFromImageContent({ apiKey, base64Image });
}

export async function extractTextFromImageContent({ apiKey, base64Image }) {
  const requestBody = {
    requests: [
      {
        image: {
          content: base64Image,
        },
        features: [
          {
            type: DEFAULT_FEATURE,
          },
        ],
        imageContext: {
          languageHints: ["en"],
        },
      },
    ],
  };

  const response = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Vision API returned a non-JSON response: ${responseText}`);
  }

  if (!response.ok) {
    const message = data.error?.message ?? responseText;
    throw new Error(`Vision API request failed (${response.status}): ${message}`);
  }

  if (data.error) {
    throw new Error(`Vision API error: ${data.error.message ?? JSON.stringify(data.error)}`);
  }

  const firstResult = data.responses?.[0];
  if (!firstResult) {
    throw new Error("Vision API returned no OCR results.");
  }

  if (firstResult.error) {
    throw new Error(
      `Vision API OCR error: ${firstResult.error.message ?? JSON.stringify(firstResult.error)}`,
    );
  }

  return firstResult.fullTextAnnotation?.text ?? firstResult.textAnnotations?.[0]?.description ?? "";
}
