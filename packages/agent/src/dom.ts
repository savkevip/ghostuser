import type { Page } from "playwright";

export interface InteractiveElement {
  index: number;
  tag: string;
  text: string;
  role?: string;
  placeholder?: string;
  type?: string;
  selector: string;
}

export async function getInteractiveElements(
  page: Page,
): Promise<InteractiveElement[]> {
  return await page.evaluate(() => {
    const interactiveSelector =
      'a, button, input:not([type="hidden"]), textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [contenteditable="true"]';
    const all = Array.from(document.querySelectorAll(interactiveSelector));

    function escapeAttr(value: string): string {
      return value.replace(/"/g, '\\"');
    }

    function selectorFor(el: Element): string {
      if (el.id && /^[\w-]+$/.test(el.id)) {
        return `#${el.id}`;
      }
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${escapeAttr(testId)}"]`;
      const name = el.getAttribute("name");
      if (name) return `${el.tagName.toLowerCase()}[name="${escapeAttr(name)}"]`;
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) {
        return `${el.tagName.toLowerCase()}[placeholder="${escapeAttr(placeholder)}"]`;
      }
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) {
        return `${el.tagName.toLowerCase()}[aria-label="${escapeAttr(ariaLabel)}"]`;
      }
      const text = (el.textContent ?? "").trim().slice(0, 40);
      if (text && el.tagName !== "INPUT") {
        return `${el.tagName.toLowerCase()}:has-text("${escapeAttr(text)}")`;
      }
      return el.tagName.toLowerCase();
    }

    return all
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden")
          return false;
        return true;
      })
      .slice(0, 60)
      .map((el, index) => {
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
        return {
          index,
          tag,
          text,
          role: el.getAttribute("role") ?? undefined,
          placeholder: el.getAttribute("placeholder") ?? undefined,
          type: (el as HTMLInputElement).type ?? undefined,
          selector: selectorFor(el),
        };
      });
  });
}
