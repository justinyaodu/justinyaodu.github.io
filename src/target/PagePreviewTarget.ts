import { slug } from "github-slugger";
import { JSDOM } from "jsdom";

import { HighlightService } from "../service/HighlightService.js";
import { MathService } from "../service/MathService.js";

import {
  PureTarget,
  type TargetBuildArgs,
  type InputTargets,
} from "./Target.js";

const highlightService = new HighlightService();
const mathService = new MathService();

type PagePreviewTargetArgs = { content: string; layout: string };
class PagePreviewTarget extends PureTarget<PagePreviewTargetArgs, string> {
  constructor(inputTargets: InputTargets<PagePreviewTargetArgs>) {
    super(`PagePreview@${inputTargets.content.key}`, inputTargets);
  }

  override async build({
    inputs: { content, layout },
    warn,
  }: TargetBuildArgs<PagePreviewTargetArgs>): Promise<string> {
    const dom = new JSDOM(layout);
    const window = dom.window;
    const document = window.document;

    {
      const contentDom = new JSDOM(content);

      for (const a of contentDom.window.document.querySelectorAll("a")) {
        a.classList.add("link");
      }

      document.querySelector("main")!.innerHTML =
        contentDom.window.document.body.innerHTML;
    }

    {
      const h1s = document.querySelectorAll("h1");
      if (h1s.length !== 1) {
        warn("Cannot infer title because page has no <h1>");
      } else {
        const title = document.createElement("title");
        title.textContent = h1s[0].textContent;
        document.head.appendChild(title);
      }
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

        // Don't add an id on the page title.
        if (heading.tagName === "H1") {
          continue;
        }

        heading.id = id;

        // Wrap the heading contents in a clickable link.
        const a = document.createElement("a");
        a.href = "#" + id;
        a.replaceChildren(...heading.childNodes);
        heading.replaceChildren(a);
      }
    }

    // TODO: use <aside> instead of <div>
    // TODO: parse aside.class1.class2 instead of class1 class2
    {
      for (const code of document.querySelectorAll(
        "blockquote > p:first-child > code:only-child",
      )) {
        const split = code.textContent!.split(".");
        const [tagName, ...classes] = split;

        const p = code.parentElement!;
        const blockquote = p.parentElement!;
        p.remove();

        const element = document.createElement(tagName);
        element.classList.add(...classes);
        element.replaceChildren(...blockquote.childNodes);
        blockquote.replaceWith(element);
      }
    }

    {
      for (const a of document.querySelectorAll<HTMLAnchorElement>("main a")) {
        const href = a.getAttribute("href")!;

        const externalLinkRegex = /^(https?|mailto):/;
        if (externalLinkRegex.test(href)) {
          continue;
        }

        if (href.startsWith("#")) {
          continue;
        }

        const markdownLinkRegex = /^([/]pages.*[.]md)(#.*)?$/;
        const match = markdownLinkRegex.exec(href);
        if (match === null) {
          warn("Link does not match regex:", { href, markdownLinkRegex });
          continue;
        }

        const markdownFilePath = match[1];
        const hash = match[2] || "";

        const pagePath = markdownFilePath
          .replace(/^[/]pages/, "")
          .replace(/\.md$/, "")
          .replace(/[/]index$/, "")
          .replace(/^$/, "/");

        a.href = pagePath + hash;
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

    {
      for (const code of document.querySelectorAll("code")) {
        const inline = code.parentElement!.tagName !== "PRE";

        let language, content;
        if (inline) {
          const parseLanguageRegex = /^!([^ ]+) (.*)$/;
          const match = parseLanguageRegex.exec(code.textContent!);

          if (match === null) {
            continue;
          }

          language = match[1];
          content = match[2];
        } else {
          const languages = Array.from(code.classList)
            .filter((c) => c.startsWith("language-"))
            .map((c) => c.replace(/^language-/, ""));

          if (languages.length !== 1) {
            continue;
          }

          language = languages[0];
          content = code.textContent!;
        }

        code.innerHTML = highlightService.render(content, language);
        if (inline) {
          code.replaceChildren(
            ...code.children[0].children[0].children[0].childNodes,
          );
        } else {
          code.replaceChildren(...code.children[0].children[0].childNodes);
          code.parentElement!.tabIndex = 0;
        }
      }
    }

    return dom.serialize();
  }
}

export { PagePreviewTarget };
