import GithubSlugger from "github-slugger";
import { JSDOM } from "jsdom";
import katex from "katex";
import prettier from "prettier";
import * as sass from "sass";
import { getHighlighter } from "shiki";

import { findFiles, readFile, writeFile } from "./filesystem.js";
import { markdownToHTML } from "./markdown.js";
import { logError, runMain } from "./script.js";

interface Page {
  title: string;
  inputFilePath: string | null;
  outputFilePath: string;
  path: string;
  dom: JSDOM;
}

type Pass = (pages: Page[]) => Page[] | Promise<Page[]>;

const getTitleFromH1: Pass = (pages) =>
  pages.map((page) => {
    let title = page.dom.window.document.querySelector("h1")?.textContent;
    if (title == null) {
      logError("Page has no h1; cannot get title:", {
        page: page.inputFilePath,
      });
      title = "Untitled page";
    }
    return { ...page, title };
  });

const setTitle: Pass = (pages) => {
  for (const page of pages) {
    const document = page.dom.window.document;
    const title = document.createElement("title");
    title.textContent = page.title;
    page.dom.window.document.head.appendChild(title);
  }
  return pages;
};

const renderDisplayMath: Pass = (pages) => {
  for (const page of pages) {
    const document = page.dom.window.document;
    for (const element of document.querySelectorAll(
      "pre > code.language-math",
    )) {
      element.parentElement!.outerHTML = katex.renderToString(
        element.textContent!,
        { throwOnError: true, displayMode: true },
      );
    }
  }
  return pages;
};

const renderInlineMath: Pass = (pages) => {
  for (const page of pages) {
    const w = page.dom.window;
    const document = w.document;

    // Get all text nodes that aren't inside <code> tags.
    const walker = document.createTreeWalker(
      document.querySelector("body")!,
      w.NodeFilter.SHOW_ALL,
      (node) => {
        if (node instanceof w.Element && node.tagName === "CODE") {
          return w.NodeFilter.FILTER_REJECT;
        }
        if (node instanceof w.Text) {
          return w.NodeFilter.FILTER_ACCEPT;
        }
        return w.NodeFilter.FILTER_SKIP;
      },
    );

    const textNodes: Text[] = Array.from({
      [Symbol.iterator]: function* () {
        while (true) {
          const node = walker.nextNode();
          if (node === null) {
            break;
          }
          if (node instanceof w.Text) {
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
        if (i % 2 == 0) {
          tempNode.appendChild(document.createTextNode(texts[i]));
        } else {
          tempNode.innerHTML += katex.renderToString(texts[i], {
            throwOnError: true,
          });
        }
      }

      textNode.replaceWith(tempNode);
      tempNode.outerHTML = tempNode.innerHTML;
    }
  }
  return pages;
};

const addHeadingIds: Pass = (pages) => {
  for (const page of pages) {
    const document = page.dom.window.document;

    const slugger = new GithubSlugger();
    for (const heading of document.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const text = heading.textContent;
      if (text !== null) {
        heading.id = slugger.slug(text);
      }
    }

    // Unlike the GitHub markdown renderer, we don't actually want ids on h1's.
    // However, omitting h1's from the preceding loop would produce inconsistent
    // slugs if the h1 has the same text as another heading.
    for (const h1 of document.querySelectorAll("h1")) {
      h1.removeAttribute("id");
    }
  }
  return pages;
};

const convertMarkdownLinks: Pass = (pages) => {
  for (const page of pages) {
    for (const a of page.dom.window.document.querySelectorAll("a")) {
      const href = a.href;

      const externalLinkRegex = /^(https?|mailto):/;
      if (externalLinkRegex.test(href)) {
        continue;
      }

      // TODO: include source position?
      const errorData = {
        href,
        page: page.inputFilePath,
      };

      const markdownLinkRegex = /^([/].*[.]md)(#.*)?$/;
      const match = markdownLinkRegex.exec(href);
      if (match === null) {
        logError("Link does not match regex:", {
          ...errorData,
          markdownLinkRegex,
        });
        continue;
      }

      const markdownFilePath = match[1];
      const hash = match[2] || "";

      const destPages = pages.filter(
        (p) => p.inputFilePath === markdownFilePath,
      );
      if (destPages.length !== 1) {
        logError("Markdown file targeted by link does not exist:", errorData);
        continue;
      }

      // TODO: check anchors too

      a.href = destPages[0].path + hash;
    }
  }
  return pages;
};

const highlightCode: Pass = async (pages) => {
  const highlighter = await getHighlighter({ theme: "solarized-light" });

  for (const page of pages) {
    const document = page.dom.window.document;
    for (const code of document.querySelectorAll("code")) {
      if (code.parentElement?.tagName === "PRE") {
        const languages = Array.from(code.classList)
          .filter((c) => c.startsWith("language-"))
          .map((c) => c.replace(/^language-/, ""));
        if (languages.length != 1) {
          continue;
        }
        const language = languages[0];

        try {
          code.innerHTML = highlighter.codeToHtml(code.textContent!, {
            lang: language,
          });
          code.innerHTML = code.children[0].children[0].innerHTML;
        } catch (e) {
          logError(e);
        }

        code.parentElement.tabIndex = 0;
      } else {
        const rawContent = code.textContent!;
        const match = /^!([^ ]+) (.*)$/.exec(rawContent);
        if (match === null) {
          continue;
        }

        const language = match[1];
        const content = match[2];

        try {
          code.innerHTML = highlighter.codeToHtml(content, { lang: language });
          code.innerHTML = code.children[0].children[0].children[0].innerHTML;
        } catch (e) {
          logError(e);
        }
      }
    }
  }
  return pages;
};

const applyPageLayout: Pass = (pages) => {
  const rawLayout = readFile("/layouts/page.html");
  return pages.map((page) => {
    const dom = new JSDOM(rawLayout);
    dom.window.document.querySelector("main")!.innerHTML =
      page.dom.window.document.querySelector("body")!.innerHTML;
    return { ...page, dom };
  });
};

const passes: Pass[] = [
  renderDisplayMath,
  renderInlineMath,
  addHeadingIds,
  convertMarkdownLinks,
  applyPageLayout,
  highlightCode,
  getTitleFromH1,
  setTitle,
];

function convertInputFilePath(inputFilePath: string): {
  path: string;
  outputFilePath: string;
} {
  let path = inputFilePath.replace(/^[/]pages/, "").replace(/\.md$/, "");
  const outputFilePath = "/public" + path + ".html";

  path = path.replace(/[/]index$/, "");
  if (path === "") {
    path = "/";
  }

  return { path, outputFilePath };
}

function compileSass() {
  const result = sass.compileString(readFile("/styles/main.scss"));
  writeFile("/public/assets/styles/main.css", result.css);
}

async function main() {
  let pages: Page[] = findFiles("/pages").map((inputFilePath) => {
    const { path, outputFilePath } = convertInputFilePath(inputFilePath);

    const rawHTML = markdownToHTML(readFile(inputFilePath));
    const dom = new JSDOM(rawHTML);

    return { title: "", path, inputFilePath, outputFilePath, dom };
  });

  for (const pass of passes) {
    pages = await pass(pages);
  }

  await Promise.all(
    pages.map(async (page) => {
      const unformattedHTML = page.dom.serialize();
      const formattedHTML = await prettier.format(unformattedHTML, {
        parser: "html",
        tabWidth: 0,
      });
      writeFile(page.outputFilePath, formattedHTML);
    }),
  );

  compileSass();
}

await runMain(main);
