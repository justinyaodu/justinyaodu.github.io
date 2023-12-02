import { slug } from "github-slugger";
import { JSDOM } from "jsdom";

import { defineService } from "../build/service.js";

type PageContent = {
  html: string;
  title: string | null;
  date: string | null;
  summaryHtml: string | null;
};

const preprocessPageContentService = defineService<string, PageContent>({
  id: "PreprocessPageContent",
  pure: true,
  run: (html, { warn }) => {
    const dom = new JSDOM(html);
    const { window } = dom;
    const { document } = window;

    const firstH1 = document.querySelector("h1");

    const title = firstH1?.textContent ?? null;
    if (title === null) {
      warn("Page has no title.");
    }

    const summaryHtml = document.querySelector("p")?.innerHTML ?? null;

    let date: string | null = null;
    const metadataPre =
      document.querySelector("pre > code.language-json")?.parentElement ?? null;
    if (metadataPre !== null) {
      const parsed: unknown = JSON.parse(metadataPre.textContent!);
      if (typeof parsed === "object" && parsed !== null) {
        if ("date" in parsed && typeof parsed.date === "string") {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (dateRegex.test(parsed.date)) {
            date = parsed.date;
          } else {
            warn("Date %s does not match regex %s.", parsed.date, dateRegex);
          }
        }
      } else {
        warn("Page metadata is not an object.");
      }
      metadataPre.remove();
    }

    if (firstH1) {
      const header = document.createElement("header");
      firstH1.replaceWith(header);
      header.appendChild(firstH1);

      if (date) {
        const time = document.createElement("time");
        time.dateTime = date;
        time.textContent = date;

        const p = document.createElement("p");
        p.appendChild(time);

        header.appendChild(p);
      }
    }

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

    return {
      html: dom.serialize(),
      title,
      date,
      summaryHtml,
    };
  },
});

const applyPageLayoutService = defineService<
  { layoutHtml: string; pageContent: PageContent },
  string
>({
  id: "ApplyPageLayout",
  pure: true,
  run: ({ layoutHtml, pageContent }) => {
    const dom = new JSDOM(layoutHtml);
    const { window } = dom;
    const { document } = window;

    document.querySelector("main")!.innerHTML = pageContent.html;

    if (pageContent.title !== null) {
      const title = document.createElement("title");
      title.textContent = pageContent.title;
      document.head.appendChild(title);
    }

    return dom.serialize();
  },
});

export { preprocessPageContentService, applyPageLayoutService };
export type { PageContent };
