# Grocery List AI Prototype

This workspace now includes a standalone grocery cart app plus the earlier OCR and grocery-list parsing prototype.

## Run The Grocery App

```powershell
npm install
npm run dev
```

The app is a Vite React prototype with mock products, reducer-based cart state, quantity controls, item totals, a live cart total, and localStorage cart persistence.

The `Import Grocery List` feature accepts an uploaded image, extracts its text with Google Cloud Vision, and parses it into structured cart instructions with OpenAI. For example, parsed items can include:

```json
[
  { "item": "cola", "quantity": 1 },
  { "item": "pasta", "quantity": 2 }
]
```

The app matches those AI items against the mock product list and adds matched products to the cart. Matching uses:

- name match: +5
- brand match: +3
- attribute match: +1 per match

If the best score is below 3, the app skips the item and asks the user to pick it manually.

## Import A Grocery List Image

The app now runs the full local pipeline:

```txt
uploaded image -> Google Vision OCR -> OpenAI parser -> product matcher -> cart
```

Run the combined app/API server:

```powershell
npm.cmd run dev
```

Then open:

```txt
http://127.0.0.1:5173/
```

Choose a grocery-list image, then click `Import Grocery List`. API keys stay server-side in `.env`.

## OCR And Parsing Prototype

It currently has two pieces:

1. OCR: send a local grocery-list image to Google Cloud Vision and print the extracted text.
2. Parsing: send grocery-list text to OpenAI and print structured JSON a cart system can understand.
3. Pipeline: send a local grocery-list image through OCR, then straight into the parser.

## Setup

1. Copy `.env.example` to `.env`.
2. Replace the placeholders with your API keys:

```txt
GOOGLE_CLOUD_VISION_API_KEY=your_google_cloud_vision_api_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
```

Do not commit `.env` or paste API keys into chat. If a key is exposed, rotate it in the provider dashboard and use the replacement.

## Run OCR

```powershell
node .\ocr-grocery-list.mjs "C:\path\to\shopping-list.jpg"
```

PNG, JPG, and other common image formats supported by Google Cloud Vision should work.

## What It Uses

The script calls the Cloud Vision REST endpoint:

```txt
POST https://vision.googleapis.com/v1/images:annotate
```

It uses `DOCUMENT_TEXT_DETECTION`, which is Google's OCR feature optimized for document-style text. That is a good fit for grocery lists because they are usually dense lines of written or typed text.

## Run The Full Pipeline

This is the main command now:

```powershell
node .\analyze-grocery-image.mjs "C:\path\to\shopping-list.jpg"
```

It runs:

```txt
image -> Google Vision OCR text -> OpenAI parser -> JSON cart instructions
```

Progress messages are printed separately from the JSON. The final JSON is printed to standard output.

## Run Grocery-List Parsing

Try the included sample:

```powershell
node .\parse-grocery-list.mjs .\sample-grocery-list.txt
```

Or pass text directly:

```powershell
node .\parse-grocery-list.mjs --text "2% Milk x1"
```

The parser prints JSON only, so the output can be saved or passed to the next cart-building step.

Each item uses a consistent descriptor object:

```json
{
  "brand": null,
  "unit": null,
  "package": null,
  "attributes": []
}
```

The model is instructed not to invent brands, quantities, units, or attributes. If something is not clear from the OCR text, it should stay `null` or `[]`, and uncertainty should lower `confidence`.

## Expected Sample Output

```json
[
  {
    "action": "add_to_cart",
    "item": "milk",
    "quantity": 1,
    "descriptors": {
      "brand": null,
      "unit": null,
      "package": null,
      "attributes": ["2%"]
    },
    "confidence": 0.95,
    "needs_review": false,
    "search_query": "2% milk",
    "original_text": "2% Milk x1"
  },
  {
    "action": "add_to_cart",
    "item": "eggs",
    "quantity": 2,
    "descriptors": {
      "brand": null,
      "unit": "18 carton",
      "package": null,
      "attributes": []
    },
    "confidence": 0.9,
    "needs_review": false,
    "search_query": "18 carton eggs",
    "original_text": "18. eggs carton x2"
  },
  {
    "action": "add_to_cart",
    "item": "butter",
    "quantity": 1,
    "descriptors": {
      "brand": null,
      "unit": null,
      "package": null,
      "attributes": ["unsalted"]
    },
    "confidence": 0.95,
    "needs_review": false,
    "search_query": "unsalted butter",
    "original_text": "Unsalted Butter x1"
  },
  {
    "action": "add_to_cart",
    "item": "gatorade",
    "quantity": 2,
    "descriptors": {
      "brand": null,
      "unit": "count",
      "package": "6-pack",
      "attributes": []
    },
    "confidence": 0.95,
    "needs_review": false,
    "search_query": "6-pack gatorade",
    "original_text": "6-pack Gatorade x2"
  },
  {
    "action": "add_to_cart",
    "item": "cookie dough",
    "quantity": 3,
    "descriptors": {
      "brand": null,
      "unit": null,
      "package": null,
      "attributes": []
    },
    "confidence": 0.95,
    "needs_review": false,
    "search_query": "cookie dough",
    "original_text": "Cookie Dough x3"
  },
  {
    "action": "add_to_cart",
    "item": "hot dog bread",
    "quantity": 2,
    "descriptors": {
      "brand": null,
      "unit": null,
      "package": null,
      "attributes": []
    },
    "confidence": 0.95,
    "needs_review": false,
    "search_query": "hot dog bread",
    "original_text": "Hot Dog Bread x2"
  },
  {
    "action": "add_to_cart",
    "item": "hot dogs",
    "quantity": 1,
    "descriptors": {
      "brand": null,
      "unit": null,
      "package": null,
      "attributes": []
    },
    "confidence": 0.85,
    "needs_review": false,
    "search_query": "hot dogs",
    "original_text": "Hot dogs"
  },
  {
    "action": "add_to_cart",
    "item": "lasagna",
    "quantity": 3,
    "descriptors": {
      "brand": null,
      "unit": null,
      "package": null,
      "attributes": ["frozen"]
    },
    "confidence": 0.95,
    "needs_review": false,
    "search_query": "frozen lasagna",
    "original_text": "frozen Lasagna x3"
  }
]
```
