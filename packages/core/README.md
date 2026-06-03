# ghostuser-core

> Core engine: simulate AI personas walking through your UI screenshots to find UX bugs.

## Install

```bash
npm install ghostuser-core
```

## Usage

```ts
import { init, simulate, listPersonas } from "ghostuser-core";
import { readFile } from "node:fs/promises";

init(process.env.ANTHROPIC_API_KEY!); // or init({ apiKey: "sk-ant-..." })

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

### API key resolution

You can provide the Anthropic key three ways. Precedence, highest first:

1. Per-call: `simulate({ apiKey, ... })`
2. Global: `init("sk-ant-...")` once at startup
3. Env var: `ANTHROPIC_API_KEY`

## Personas (v0)

```ts
import { listPersonas } from "ghostuser-core";
console.log(listPersonas());
// → [{ id: "newbie", name: "Maya the Newbie", ... }, ...]
```

Available: `newbie`, `buyer`, `power`, `skeptic`, `hurried`.

## License

MIT
