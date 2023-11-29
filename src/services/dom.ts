import { slug } from "github-slugger";
import { JSDOM } from "jsdom";

import type { ServiceDefinition } from "../build/index.js";

const preprocessPageContentService: ServiceDefinition<string, string> = {
  id: "PreprocessPageContent",
  pure: true,
  call: ({ args, warn }) => {
    const dom = new JSDOM(args);
    const { window } = dom;
    const { document } = window;

    for (const a of document.querySelectorAll("a")) {
      a.classList.add("link");

      const href = a.getAttribute("href")!;

      const externalLinkRegex = /^(https?|mailto):/;
      if (externalLinkRegex.test(href)) {
        continue;
      }

      if (href.startsWith("#")) {
        continue;
      }

      const markdownLinkRegex = /^([/]pages[/].*[.]md)(#.*)?$/;
      const match = markdownLinkRegex.exec(href);
      if (match === null) {
        warn(
          `Link ${JSON.stringify(
            href,
          )} does not match regex ${markdownLinkRegex}`,
        );
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

    for (const heading of document.querySelectorAll("h2, h3, h4, h5, h6")) {
      const id = slug(heading.textContent!);
      const a = document.createElement("a");
      a.href = `#${id}`;
      a.replaceChildren(...heading.childNodes);
      heading.replaceChildren(a);
    }

    for (const code of document.querySelectorAll(
      "blockquote > p:first-child > code:only-child",
    )) {
      let tagName: string | null = null;
      const classes: string[] = [];
      const ids: string[] = [];

      const selector = code.textContent!;
      let unparsed = selector;
      while (unparsed) {
        let match;
        if ((match = /^([A-Za-z][A-Za-z0-9_-]*)(.*)$/.exec(unparsed))) {
          tagName = match[1];
          unparsed = match[2];
        } else if ((match = /^#([A-Za-z][A-Za-z0-9_-]*)(.*)$/.exec(unparsed))) {
          ids.push(match[1]);
          unparsed = match[2];
        } else if (
          (match = /^[.]([A-Za-z][A-Za-z0-9_-]*)(.*)$/.exec(unparsed))
        ) {
          classes.push(match[1]);
          unparsed = match[2];
        } else {
          warn(`Failed to parse selector: ${JSON.stringify(selector)}`);
          break;
        }
      }

      // TODO: use null tagname to modify next element
      if (tagName === null) {
        warn(`No tag name in selector: ${JSON.stringify(selector)}`);
        continue;
      }

      const element = document.createElement(tagName);
      element.classList.add(...classes);

      switch (ids.length) {
        case 0:
          break;
        case 1:
          element.id = ids[0];
          break;
        default:
          warn(`Multiple ids in selector: ${JSON.stringify(selector)}`);
          break;
      }

      const p = code.parentElement!;
      const blockquote = p.parentElement!;
      p.remove();

      element.replaceChildren(...blockquote.childNodes);
      blockquote.replaceWith(element);
    }

    return dom.serialize();
  },
};

export { preprocessPageContentService };
