import { NodeSSH } from "node-ssh";
import {
	MutationAnalysisClient,
	type MutationAnalysis,
} from "./mutationAnalysisClient.js";

export class SSHRailsClient {
	private ssh: NodeSSH;
	private connected: boolean;
	private workingDir: string;
	private mutationAnalysisClient: MutationAnalysisClient;

	constructor() {
		this.ssh = new NodeSSH();
		this.connected = false;
		this.workingDir = "";
		this.mutationAnalysisClient = new MutationAnalysisClient(this);
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

	private async executeCommand(command: string): Promise<string> {
		if (!this.connected) {
			throw new Error("Not connected to Rails server");
		}

		// Add a clear delimiter for our output
		const OUTPUT_DELIMITER =
			"===RAILS_OUTPUT_DELIMITER_" +
			Math.random().toString(36).slice(2) +
			"===";

		const result = await this.ssh.execCommand(`
			cd "${this.workingDir}" &&
			RAILS_ENV=production bundle exec rails c <<-EOF
				begin
					result = ${command}
					puts "${OUTPUT_DELIMITER}"
					puts result.inspect
				rescue => e
					puts "${OUTPUT_DELIMITER}"
					puts "Error: #{e.message}"
					exit 1
				end
EOF
		`);

		// Add debug logging
		console.error("Command execution result:", {
			code: result.code,
			stdout: result.stdout,
			stderr: result.stderr,
		});

		// If there's a real error (non-zero exit code), throw it
		if (result.code !== 0) {
			throw new Error(
				`Command failed with exit code ${result.code}.\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`
			);
		}

		return result.stdout;
	}

	async execute(code: string): Promise<string> {
		const result = await this.executeCommand(code);
		return this.parseResult(result);
	}

	async verifyReadOnly(code: string): Promise<boolean> {
		// List of keywords that indicate mutations
		const mutationKeywords = [
			"update",
			"delete",
			"destroy",
			"save",
			"create",
			"insert",
			"alter",
			"drop",
		];

		// Check for mutation keywords
		const containsMutation = mutationKeywords.some((keyword) =>
			code.toLowerCase().includes(keyword)
		);

		if (containsMutation) {
			return false;
		}

		// Additional analysis could be performed here
		return true;
	}

	async executeReadOnly(code: string): Promise<unknown> {
		const result = await this.executeCommand(code);
		return this.parseResult(result);
	}

	private parseResult(result: string): string {
		try {
			// Find the delimiter and take everything after it up to 'nil'
			const parts = result.split(/===RAILS_OUTPUT_DELIMITER_[a-z0-9]+=== */);

			// Get the last part (after the delimiter)
			const output = parts[parts.length - 1];

			return output;
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
