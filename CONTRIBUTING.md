# Contributing

We welcome contributions to the project! Here's how you can get involved:

- 🐛 Report bugs and submit feature requests
- 🔧 Submit pull requests
- 📖 Improve documentation
- 💬 Join discussions
- ⭐ Star the repository

## Development

Prerequisites:

- [mise](https://mise.jdx.dev/) (manages Node.js, pnpm, and prek)
- Docker

Setup:

```bash
mise run init     # Installs dependencies and configures git hooks
```

Before submitting a pull request, please ensure all checks, tests, and formatting rules pass by running:

```bash
mise run check
mise run test
```

## Versioning

The version number format for this package conforms with [Semantic Versioning 2.0.0](https://semver.org/#semantic-versioning-200).

## Publishing

This library is published to the [npm registry](https://www.npmjs.com/). This process is automated through CI/CD workflows and should not be done manually.
