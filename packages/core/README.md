# @ghostuser/core

> Core engine: simulate AI personas walking through your UI screenshots to find UX bugs.

## Install

```bash
npm install @ghostuser/core
```

## Usage

```ts
import { simulate, listPersonas } from "@ghostuser/core";
import { readFile } from "node:fs/promises";

const buffer = await readFile("./screen.png");
const result = await simulate({
  imageBase64: buffer.toString("base64"),
  personaId: "newbie",
  goal: "Sign up for the product",
});

console.log(result.persona.name, result.verdict);
console.log(result.chainOfThought);
console.log(result.bugs);
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Personas (v0)

```ts
import { listPersonas } from "@ghostuser/core";
console.log(listPersonas());
// → [{ id: "newbie", name: "Maya the Newbie", ... }, ...]
```

Available: `newbie`, `buyer`, `power`, `skeptic`, `hurried`.

## License

MIT
