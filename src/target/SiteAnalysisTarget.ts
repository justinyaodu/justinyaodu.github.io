import { JSDOM } from "jsdom";

import { PureTarget, type TargetBuildArgs } from "./Target.js";

import type { RecordTarget } from "./RecordTarget.js";

type SiteAnalysisTargetArgs = { pages: Record<string, string> };
class SiteAnalysisTarget extends PureTarget<SiteAnalysisTargetArgs, undefined> {
  constructor(pages: RecordTarget<string>) {
    super("SiteAnalysis", { pages });
  }

  protected override async build({
    inputs: { pages },
    warn: outerWarn,
  }: TargetBuildArgs<SiteAnalysisTargetArgs>): Promise<undefined> {
    const doms: Record<string, JSDOM> = Object.fromEntries(
      Object.entries(pages).map(([k, v]) => [k, new JSDOM(v)]),
    );

    for (const [currentPagePath, dom] of Object.entries(doms)) {
      const warnings: unknown[][] = [];
      const warn = (...args: unknown[]) => {
        warnings.push(args);
      };

      try {
        for (const a of dom.window.document.querySelectorAll("a")) {
          const href = a.getAttribute("href")!;

          const externalLinkRegex = /^(https?|mailto):/;
          if (externalLinkRegex.test(href)) {
            continue;
          }

          if (href.length === 0) {
            warn("Link is empty");
            continue;
          }

          const linkRegex = /^([/].*)?(#.*)?$/;
          const match = linkRegex.exec(href);
          if (match === null) {
            warn("Link does not match regex:", { href, linkRegex });
            continue;
          }

          const pagePath = match[1] || currentPagePath;
          const hash = match[2] || "";

          if (!(pagePath in doms)) {
            warn("Page targeted by link does not exist:", { href });
            continue;
          }

          if (hash !== "") {
            const id = hash.substring(1);
            if (doms[pagePath].window.document.getElementById(id) === null) {
              warn("Element targeted by link hash does not exist:", { href });
            }
          }
        }
      } finally {
        if (warnings.length > 0) {
          outerWarn(`[page] ${currentPagePath}`);
          for (const warning of warnings) {
            outerWarn(" ".repeat(6), ...warning);
          }
        }
      }
    }
  }
}

export { SiteAnalysisTarget };
