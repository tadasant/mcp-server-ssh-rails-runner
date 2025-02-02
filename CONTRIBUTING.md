# Test locally

```
npm run build
npx @wong2/mcp-cli node /Users/admin/github-projects/mcp-server-ssh-rails-runner/build/index.js
```

# Publish

## 1. Build the project

```
npm run build
```

## 2. Update version (choose one):

```
npm version patch # for bug fixes (1.0.0 -> 1.0.1)
npm version minor # for new features (1.0.0 -> 1.1.0)
npm version major # for breaking changes (1.0.0 -> 2.0.0)
```

This will automatically:

- Update package.json version
- Create a git commit
- Create a git tag

## 3. Push changes and tag to GitHub

```
git push origin main
git push origin v1.0.1 # replace with your new version
```

## 4. Publish to npm

```
npm publish
```
