import { NodeSSH } from "node-ssh";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export class SSHRailsClient {
	private ssh: NodeSSH;
	private connected: boolean;
	private workingDir: string;

	constructor() {
		this.ssh = new NodeSSH();
		this.connected = false;
		this.workingDir = "";
	}

	async connect(config: {
		host: string;
		username: string;
		workingDir: string;
		privateKeyPath?: string;
		password?: string;
	}): Promise<void> {
		try {
			await this.ssh.connect(config);

			// Check if directory exists before storing it
			const checkDir = await this.ssh.execCommand(
				`test -d "${config.workingDir}" && echo "exists"`
			);
			if (!checkDir.stdout.includes("exists")) {
				throw new Error(
					`Working directory '${config.workingDir}' does not exist`
				);
			}

			this.workingDir = config.workingDir;
			this.connected = true;
		} catch (error) {
			this.connected = false;
			throw new Error(`Failed to connect to Rails server: ${error}`);
		}
	}

	private async executeCommand(localFilePath: string): Promise<string> {
		if (!this.connected) {
			throw new Error("Not connected to Rails server");
		}

		// Use timestamp and random string for unique filename
		const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).slice(2);
		const remoteFileName = `runner_${uniqueSuffix}.rb`;
		const remoteFilePath = `/tmp/${remoteFileName}`; // Use /tmp for temporary files

		// Add a clear delimiter for our output
		const OUTPUT_DELIMITER =
			"===RAILS_OUTPUT_DELIMITER_" +
			Math.random().toString(36).slice(2) +
			"===";

		try {
			// 1. SCP the file to the remote server's /tmp directory
			await this.ssh.putFile(localFilePath, remoteFilePath);

			// 2. Execute the file using rails runner
			// Ensure proper quoting for paths that might contain spaces
			const command = `cd "${this.workingDir}" && echo "${OUTPUT_DELIMITER}" && RAILS_ENV=production bundle exec rails runner "${remoteFilePath}" && echo "${OUTPUT_DELIMITER}"`;
			const result = await this.ssh.execCommand(command);

			// Add debug logging
			console.error("Command execution result:", {
				code: result.code,
				stdout: result.stdout,
				stderr: result.stderr,
			});

			// If there's a real error (non-zero exit code), throw it
			// stderr might contain Rails stack traces which are useful
			if (result.code !== 0) {
				// Attempt to parse stderr for a cleaner error message if possible
				let errorMessage = `Command failed with exit code ${result.code}.`;
				if (result.stderr) {
					errorMessage += `\nSTDERR: ${result.stderr}`;
				}
				// Include stdout as it might contain partial output or clues
				if (result.stdout) {
					errorMessage += `\nSTDOUT: ${result.stdout}`;
				}
				throw new Error(errorMessage);
			}
			return result.stdout;

		} catch (error) {
			// Rethrow any error caught during SCP or execution
			throw new Error(`Failed during remote execution: ${error}`);
		} finally {
			// 3. Clean up the remote file regardless of success or failure
			try {
				// Ensure proper quoting for path
				await this.ssh.execCommand(`rm "${remoteFilePath}"`);
			} catch (cleanupError) {
				console.error(
					`Failed to clean up remote file ${remoteFilePath}:`,
					cleanupError
				);
				// Log cleanup error but don't throw, as the primary operation might have succeeded/failed already
			}
		}
	}

	async execute(filePath: string): Promise<string> {
		const result = await this.executeCommand(filePath);
		return this.parseResult(result);
	}

	async verifyReadOnly(code: string): Promise<boolean> {
		// TODO: this is unreliable, could be better with sampling
		// List of keywords that indicate mutations
		// const mutationKeywords = [
		// 	"update",
		// 	"delete",
		// 	"destroy",
		// 	"save",
		// 	"create",
		// 	"insert",
		// 	"alter",
		// 	"drop",
		// ];

		// // Check for mutation keywords
		// const containsMutation = mutationKeywords.some((keyword) =>
		// 	code.toLowerCase().includes(keyword)
		// );

		// if (containsMutation) {
		// 	return false;
		// }

		// Additional analysis could be performed here
		return true;
	}

	async executeReadOnly(filePath: string): Promise<string> {
		// Note: With rails runner, we lose the sandbox guarantee provided by `rails c`.
		// Any mutation WILL be executed. The distinction is now purely semantic
		// for the caller, indicating intent rather than enforcement.
		const result = await this.executeCommand(filePath);
		return this.parseResult(result);
	}

	async executeMutate(filePath: string): Promise<string> {
		// Assumes caller (executeQueryMutate tool) has confirmed user intent.
		const result = await this.executeCommand(filePath);
		return this.parseResult(result);
	}

	private parseResult(result: string): string {
		try {
			// Find the first delimiter and take everything after it up to the last delimiter
			const delimiterRegex = /===RAILS_OUTPUT_DELIMITER_[a-z0-9]+===/g;
			const matches = [...result.matchAll(delimiterRegex)];

			if (matches.length >= 2) {
				const startIndex = matches[0].index! + matches[0][0].length;
				const endIndex = matches[matches.length - 1].index!;
				let output = result.substring(startIndex, endIndex).trim();

				// Attempt to clean common Rails inspection outputs like leading/trailing quotes
				if (output.startsWith('\"') && output.endsWith('\"')) {
					// It looks like a string inspect output, try to unescape it
					try {
						// Replace escaped quotes and backslashes
						output = output
							.slice(1, -1)
							.replace(/\\"/g, '"')
							.replace(/\\\\/g, '\\');
					} catch (e) {
						// If unescaping fails, just return the sliced string
						console.warn("Failed to unescape string output:", e);
						output = output.slice(1, -1);
					}
				} else if (output === "nil") {
					return ""; // Represent nil as an empty string
				}
				// TODO: Potentially handle other inspect formats like arrays, hashes if needed

				return output;
			} else {
				// If delimiters aren't found as expected, return the trimmed raw output
				console.warn("Could not find expected delimiters in output. Raw:", result);
				return result.trim();
			}
		} catch (error) {
			console.error("Parse error:", error);
			console.error("Raw result:", result);
			// If anything goes wrong, return the original trimmed string
			return result.trim();
		}
	}

	async disconnect(): Promise<void> {
		if (this.connected) {
			await this.ssh.dispose();
			this.connected = false;
		}
	}
}
