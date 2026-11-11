[![Main](https://github.com/dvirtz/devcontainer-ssh-terminal/workflows/Main/badge.svg)](https://github.com/dvirtz/devcontainer-ssh-terminal/actions?query=workflow%3AMain) [![Visual Studio Marketplace Version](https://img.shields.io/github/v/release/dvirtz/devcontainer-ssh-terminal?label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=dvirtz.devcontainer-ssh-terminal) [![Open VSX Version](https://img.shields.io/open-vsx/v/dvirtz/devcontainer-ssh-terminal)](https://open-vsx.org/extension/dvirtz/devcontainer-ssh-terminal)

# Devcontainer SSH Terminal

Open a terminal on a devcontainer’s SSH host.

## Usage

Requires desktop VS Code 1.91.1+, local OpenSSH, and a trusted container workspace on a POSIX SSH host.

1. Install Devcontainer SSH Terminal from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=dvirtz.devcontainer-ssh-terminal) or [Open VSX](https://open-vsx.org/extension/dvirtz/devcontainer-ssh-terminal) in your **local** VS Code instance.
2. Open a container through **Remote-SSH**, or using a **Docker SSH endpoint or context**.
3. Run **Dev Containers: Open SSH Host Terminal** from the Command Palette.

Each invocation opens a new terminal. It starts in the original host project directory when known, otherwise your SSH home directory. SSH uses your existing local keys, agent, and configuration, including **Remote.SSH: Path** and **Config File** settings.

The command is hidden and unregistered in local workspaces. There are no extension-specific settings or default keybindings.

## Limitations

- Local containers without an SSH host, Docker TCP endpoints, nested remote connections, and Windows SSH hosts are unsupported.
- Docker contexts require a local Docker CLI; **Dev Containers: Docker Path** and **Docker Args** are honored.
- Host detection relies on internal Dev Containers metadata, which may change between versions.

If a connection fails, check that the host works with your local SSH client or that the recorded Docker context exists locally. SSH authentication prompts and errors appear in the terminal.

## Development

Use Node.js 22.14+ in the 22.x line, or the included development container.

```sh
npm ci
npm run build
npm run lint
npm run spellcheck
npm test
npm run package
```

To try a local build, install the generated VSIX **locally** using **Extensions: Install from VSIX...**.

On headless Linux, run tests with `xvfb-run -a npm test`. Set `VSCODE_VERSION=stable` to test current stable instead of the minimum supported version. Automated tests cover parsing and terminal creation; real SSH/container workflows need manual validation.

## Releases

Use conventional commits. CI validates pull requests and packages a VSIX. Successful `main` pushes publish through semantic-release to the Visual Studio Marketplace and Open VSX when all three repository secrets are configured:

- `RELEASE_PAT`: GitHub token for release commits, tags, and releases.
- `VSCE_PAT`: Visual Studio Marketplace publishing token.
- `OVSX_PAT`: Open VSX publishing token with access to the `dvirtz` namespace. Follow the [Open VSX publishing setup](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions) to configure your publisher account and create a token.

If any secret is missing, the release job fails with the missing secret's name. The build job still provides a `vscode-package` artifact, available under **Artifacts** on the workflow run's summary page. Semantic-release generates `CHANGELOG.md`; do not edit it manually.

[MIT license](LICENSE.txt).
