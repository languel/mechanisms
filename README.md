# mechanisms

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the repository root as a static website on every push to any branch. It can also be started from **Actions → Deploy to GitHub Pages → Run workflow**, selecting the branch to publish.

Each successful deployment replaces the site at https://languel.github.io/mechanisms/. Branches share this URL; they do not receive separate preview sites.

Add an `index.html` and static assets to the repository root. No compilation or dependency installation is performed. Use relative asset URLs (or the `/mechanisms/` base path). Git metadata and workflow files are excluded from the published artifact.

New branches inherit the workflow when created from main. Existing branches must contain the workflow to run it.

### Required repository settings

- **Settings → Pages → Build and deployment → Source:** GitHub Actions.
- **Settings → Environments → github-pages → Deployment branches and tags:** No restriction.

The repository starts without website content, so an index page must be added before the site has a homepage.
