# Deploy to GitHub Pages from GitHub Actions, the easy way

If you use [GitHub Actions](https://docs.github.com/en/actions) to build your static website, you can deploy it to [GitHub Pages](https://pages.github.com) in 10 lines of code. No dependencies, configuration, or access tokens needed!

## Push static files to the `gh-pages` branch

Add this step to the end of your build job, replacing `public/` with the path to the newly built static files:

```yml
- name: Push static files to gh-pages
  run: |
    cp -a .git public/
    cd public/
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git checkout --orphan gh-pages
    git add .
    git commit -m "Deploy static website"
    git push -uf origin gh-pages
```

> `aside.warning`
>
> If you already have a `gh-pages` branch, this will erase its history!

In case you're wondering how this looks in a complete workflow, I use [this](https://github.com/justinyaodu/justinyaodu.github.io/blob/main/.github/workflows/build.yml) to build and deploy the website you're reading right now.

### How it works

1. `cp -a .git public/` copies the repository metadata into `public/`, including the configured remotes. This makes `public/` equivalent to a clone of your repository, where the working tree contains only your static files.
1. `git config` sets the username and email used to create the commit. This is required, but the actual values don't matter (besides appearing in your repo's commit history). I picked the username and email [used by the GitHub Actions bot](https://github.com/orgs/community/discussions/26560).
1. `git checkout --orphan gh-pages` switches to a new `gh-pages` branch with no history.
1. `git add` and `git commit` create a single commit with all of the static files.
1. `git push -uf origin gh-pages` force-pushes the single commit to the `gh-pages` branch on GitHub.

This can probably be modified to preserve the `gh-pages` commit history, but I had no need for it personally.

## Configure GitHub Pages

Follow [these steps](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-from-a-branch) to publish your static site from the root of the `gh-pages` branch. When your workflow runs and pushes new static files to `gh-pages`, your website will be redeployed automatically.

> `aside.info`
>
> Also consider creating a [`.nojekyll` file](https://github.blog/2009-12-29-bypassing-jekyll-on-github-pages/); this speeds up your GitHub Pages deployments by skipping the Jekyll build which occurs by default. For example, you could add `touch .nojekyll` right before `git add .` in the commands above.
