# secretvaults-ts

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/NillionNetwork/secretvaults-ts/.github%2Fworkflows%2Fci.yaml)
![GitHub package.json version](https://img.shields.io/github/package-json/v/NillionNetwork/secretvaults-ts)

## Getting Started

If you're unsure where to start, head over to the [Nillion Private Storage Docs](https://docs.nillion.com/build/private-storage/overview).

## Documentation

This project uses TypeDoc to generate API documentation from TypeScript source code and TSDoc comments, published here: [https://nillion.pub/secretvaults-ts](https://nillion.pub/secretvaults-ts)

### Generating Documentation

To generate the documentation:

```bash
pnpm docs
```

This creates static HTML documentation in the `docs/` directory.

### Writing Documentation

We use [TSDoc](https://tsdoc.org/) comments (JSDoc-style) to document our code. TSDoc provides a standardized syntax for TypeScript documentation comments. Please refer to the [TSDoc documentation](https://tsdoc.org/) for comprehensive guidelines and examples.

### Serving Documentation Locally

To generate and serve the documentation on a local server:

```bash
pnpm docs:serve
```

This will start a local server and open the documentation in your browser. The documentation will typically be available at `http://localhost:3000`.

Alternatively, you can use any static file server:

```bash
# Using Python
cd docs && python3 -m http.server 8000

# Using Node.js
npx http-server docs -p 8080
```

### Automated Documentation Deployment

Documentation is automatically built and deployed via GitHub Actions:

- **Main branch**: Deploys to GitHub Pages root
- **Pull requests**: Builds docs and posts a comment with artifact link
- **Other branches**: Can be configured to deploy to subdirectories

## Contributing

We welcome contributions! Here's how you can get involved:

- 🐛 Report bugs and submit feature requests
- 🔧 Submit pull requests
- 📖 Improve documentation
- 💬 Join discussions
- ⭐ Star the repository

## Getting Help

- [Create an Issue](https://github.com/NillionNetwork/secretvaults-ts/issues/new/choose)
- [Join our Discord](https://discord.com/invite/nillionnetwork)

## License

This project is licensed under the [MIT License](./LICENSE).
