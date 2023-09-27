import { JSDOM } from "jsdom";

import type { SiteAnalysisTargetArgs } from "./SiteAnalysisTarget.js";
import {
  PureTarget,
  type InputTargets,
  type TargetBuildArgs,
} from "./Target.js";

type BlogIndexTargetArgs = SiteAnalysisTargetArgs & { layout: string };
class BlogIndexTarget extends PureTarget<BlogIndexTargetArgs, string> {
  constructor(inputs: InputTargets<BlogIndexTargetArgs>) {
    super("BlogIndex", inputs);
  }

  protected override async build({
    inputs: { pages, layout },
  }: TargetBuildArgs<BlogIndexTargetArgs>): Promise<string> {
    const dom = new JSDOM(layout);
    const window = dom.window;
    const document = window.document;
    const main = document.querySelector("main")!;

    const title = "Justin's Blog";

    document.querySelector("title")!.textContent = title;

    const h1 = document.createElement("h1");
    h1.textContent = title;
    main.appendChild(h1);

    const posts = Object.entries(pages)
      .filter(
        ([path, data]) =>
          path.startsWith("/blog") && data.metadata.published !== null,
      )
      .map(([path, data]) => ({
        path,
        ...data,
      }))
      .sort((a, b) => (a.metadata.published! < b.metadata.published! ? -1 : 1))
      .reverse();

    for (const post of posts) {
      const div = document.createElement("div");

      const postTitle = document.createElement("p");
      postTitle.textContent = post.metadata.title;
      div.appendChild(postTitle);

      const published = document.createElement("p");
      published.textContent = post.metadata.published;
      div.appendChild(published);

      const description = document.createElement("p");
      if (post.metadata.descriptionHTML) {
        description.innerHTML = post.metadata.descriptionHTML;
        div.appendChild(description);
      }

      main.appendChild(div);
    }

    return dom.serialize();
  }
}

export { BlogIndexTarget };
