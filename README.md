# MCP Server: SSH Rails Runner

An MCP server that enables secure remote execution of Rails console commands via SSH. This server provides tools for both read-only operations and carefully managed mutations in a deployed Rails environment.

This works great with Cursor. You can use Cursor Composer to pull in your Rails model files as context and then use the `execute_read_only`, `dry_run_mutate`, and `execute_mutate` tools to make changes to the database. No need to trudge through complicated Admin UI's to get your data wrangling and analysis done.

## Example

![Example](./assets/example.png)

## Features

- Remote Rails console execution over SSH
- Safe read-only operations
- Dry-run capability for mutations
- Execution of approved mutations
- Resource management for code snippets

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variables:

```bash
SSH_HOST=your.remote.host
SSH_USER=your_ssh_user
SSH_PRIVATE_KEY_PATH=your_SSH_PRIVATE_KEY_PATH
RAILS_WORKING_DIR=/path/to/rails/app
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
	"mcpServers": {
		"ssh-rails-runner": {
			"command": "npx",
			"args": ["mcp-server-ssh-rails-runner"],
			"env": {
				"SSH_HOST": "your.remote.host",
				"SSH_USER": "your_ssh_user",
				"SSH_PRIVATE_KEY_PATH": "your_SSH_PRIVATE_KEY_PATH",
				"RAILS_WORKING_DIR": "/path/to/rails/app/root"
			}
		}
	}
}
```

## Available Tools

### run_read_only

Executes read-only Rails console operations. The tool will analyze the request, formulate safe read-only commands, and return the results.

### dry_run_mutate

Plans and validates potential mutations. Creates a code snippet resource with the proposed changes without executing them.

### execute_mutate

Executes previously approved mutation code snippets. Requires explicit user approval of a code snippet resource before execution.

## Security Considerations

- Only use with trusted SSH endpoints from your own local machine that is (temporarily) provided access to the remote environment
- Review all mutations before execution

## License

MIT
