import { slug } from "github-slugger";
import { JSDOM } from "jsdom";

import { MathService } from "../service/MathService.js";

import { PureTarget, Target, type TargetBuildArgs } from "./Target.js";

const mathService = new MathService();

type PagePreviewTargetArgs = { html: string };
class PagePreviewTarget extends PureTarget<PagePreviewTargetArgs, string> {
  constructor(html: Target<never, string>) {
    super(`PagePreview@${html.key}`, { html });
  }

  override async build({
    inputs: { html },
    warn,
  }: TargetBuildArgs<PagePreviewTargetArgs>): Promise<string> {
    const dom = new JSDOM(html);
    const window = dom.window;
    const document = window.document;

    setTitleFromH1: {
      const h1s = document.querySelectorAll("h1");
      if (h1s.length !== 1) {
        warn("Cannot infer title because page has no <h1>");
        break setTitleFromH1;
      }

      const title = document.createElement("title");
      title.textContent = h1s[0].textContent;
      document.head.appendChild(title);
    }

    {
      const ids = new Set<string>();
      for (const heading of document.querySelectorAll(
        "h1, h2, h3, h4, h5, h6",
      )) {
        const id = slug(heading.textContent!);
        if (ids.has(id)) {
          warn("Duplicate heading id:", id);
          continue;
        }

        ids.add(id);
        heading.id = id;
      }
    }

    {
      // Get all text nodes that aren't inside <code> tags.
      const walker = document.createTreeWalker(
        document.querySelector("body")!,
        window.NodeFilter.SHOW_ALL,
        (node) => {
          if (node instanceof window.Element && node.tagName === "CODE") {
            return window.NodeFilter.FILTER_REJECT;
          }
          if (node instanceof window.Text) {
            return window.NodeFilter.FILTER_ACCEPT;
          }
          return window.NodeFilter.FILTER_SKIP;
        },
      );

      const textNodes: Text[] = Array.from({
        [Symbol.iterator]: function* () {
          while (true) {
            const node = walker.nextNode();
            if (node === null) {
              break;
            }
            if (node instanceof window.Text) {
              yield node;
            }
          }
        },
      });

      for (const textNode of textNodes) {
        const inlineMathRegex = /[$]((?:[^$]|\\[$])+)[$]/g;
        const texts = textNode.data.split(inlineMathRegex);

        if (texts.length === 1) {
          continue;
        }

        const tempNode = document.createElement("span");
        for (let i = 0; i < texts.length; i++) {
          const text = texts[i];
          if (i % 2 == 0) {
            tempNode.appendChild(document.createTextNode(text));
          } else {
            const renderResult = mathService.render(text, false);
            if (renderResult.ok) {
              tempNode.innerHTML += renderResult.value;
            } else {
              warn(renderResult.error);
              const errorNode = document.createElement("code");
              errorNode.textContent = String(renderResult.error);
              errorNode.style.color = "red";
              tempNode.appendChild(errorNode);
            }
          }
        }

        textNode.replaceWith(tempNode);
        tempNode.outerHTML = tempNode.innerHTML;
      }
    }

    {
      for (const code of document.querySelectorAll(
        "pre > code.language-math",
      )) {
        const pre = code.parentElement!;
        const result = mathService.render(code.textContent!, true);
        if (result.ok) {
          pre.outerHTML = result.value;
        } else {
          warn(result.error);
          pre.style.color = "red";
          pre.textContent = String(result.error);
        }
      }
    }

    return dom.serialize();
  }
}

export { PagePreviewTarget };
