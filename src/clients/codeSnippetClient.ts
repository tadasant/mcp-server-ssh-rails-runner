import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Define the snippet type directly
type SnippetType = "readOnly" | "mutate";

interface CodeSnippet {
	id: string; // Will be code_snippet_<name>
	name: string; // User-provided name
	code: string;
	description: string;
	type: SnippetType;
	createdAt: Date;
	filePath: string;
}

// Constants for metadata parsing
const META_PREFIX = "# MCP Meta: ";
const META_END_MARKER = "# --- End MCP Meta ---";

export class CodeSnippetClient {
	private readonly codeSnippetDirectory: string;

	constructor(codeSnippetDirectory?: string) {
		this.codeSnippetDirectory =
			codeSnippetDirectory ||
			path.join(os.tmpdir(), "mcp-ssh-rails-runner-code-snippets");

		fs.mkdir(this.codeSnippetDirectory, { recursive: true }).catch((err) => {
			console.error(
				`Failed to create code snippet directory: ${this.codeSnippetDirectory}`,
				err,
			);
		});
	}

	// Generates the expected *.rb filename
	private getSnippetFilename(name: string): string {
		const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, "_") || "unnamed";
		return `code_snippet_${sanitizedName}.rb`; // Changed extension to .rb
	}

	// Generates the snippet ID from the name
	private getSnippetId(name: string): string {
		const filename = this.getSnippetFilename(name);
		return path.parse(filename).name; // Extracts 'code_snippet_<sanitizedName>'
	}

	// Generates the full file path for a given code snippet name
	public getSnippetFilePath(name: string): string {
		const filename = this.getSnippetFilename(name);
		return path.join(this.codeSnippetDirectory, filename);
	}

	// Parses metadata and code from .rb file content
	private parseRbContent(content: string, filePath: string): Omit<CodeSnippet, 'filePath'> {
		const lines = content.split('\n');
		const metadata: Partial<Record<keyof Omit<CodeSnippet, 'code' | 'filePath'>, any>> = {};
		let codeStartIndex = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.startsWith(META_PREFIX)) {
				const metaLine = line.substring(META_PREFIX.length);
				const separatorIndex = metaLine.indexOf('=');
				if (separatorIndex > 0) {
					const key = metaLine.substring(0, separatorIndex).trim();
					const value = metaLine.substring(separatorIndex + 1).trim();
					if (key === 'id' || key === 'name' || key === 'type' || key === 'description' || key === 'createdAt') {
						metadata[key as keyof typeof metadata] = value;
					}
				}
			} else if (line.startsWith(META_END_MARKER)) {
				codeStartIndex = i + 1;
				break; // Stop parsing metadata
			} else if (!line.trim().startsWith('#') && !line.trim() === false) {
                // Stop if we hit non-comment line before end marker (flexible parsing)
                codeStartIndex = i;
                break;
            }
		}

		// Validate required metadata
		if (!metadata.id || !metadata.name || !metadata.type || !metadata.createdAt) {
			throw new Error(`Missing or invalid metadata in snippet file: ${filePath}`);
		}

		const code = lines.slice(codeStartIndex).join('\n');

		return {
			id: metadata.id,
			name: metadata.name,
			code: code,
			description: metadata.description || '',
			type: metadata.type as SnippetType,
			createdAt: new Date(metadata.createdAt), // Convert timestamp back to Date
		};
	}

	// Creates the .rb snippet file with metadata comments
	async createCodeSnippet(params: {
		name: string;
		code: string;
		type: SnippetType;
		description?: string;
	}): Promise<{ id: string; filePath: string }> {
		const { name, code, type, description } = params;
		const id = this.getSnippetId(name);
		const filePath = this.getSnippetFilePath(name);
		const createdAt = new Date();
		const finalDescription = description || `CodeSnippet prepared on ${createdAt.toISOString()}`;

		// Check existence (using .rb path)
		try {
			await fs.access(filePath);
			throw new Error(
				`CodeSnippet name "${name}" already exists as ${path.basename(filePath)}. Please choose a different name or delete the existing file.`,
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("already exists")) {
				throw error;
			}
			if (!(error instanceof Error && 'code' in error && error.code === "ENOENT")) {
				console.warn(`Unexpected error checking file existence: ${filePath}`, error);
			}
		}

		// Construct file content
		const metadataContent = [
			`${META_PREFIX}id=${id}`,
			`${META_PREFIX}name=${name}`, // Store original name
			`${META_PREFIX}type=${type}`,
			`${META_PREFIX}createdAt=${createdAt.toISOString()}`,
			`${META_PREFIX}description=${finalDescription}`,
			META_END_MARKER,
			'', // Add a blank line after metadata
		].join('\n');

		const fileContent = metadataContent + code;

		try {
			await fs.writeFile(filePath, fileContent, "utf-8");
			return { id, filePath };
		} catch (err) {
			console.error(`Failed to write or open snippet file: ${filePath}`, err);
			const errorMessage = err instanceof Error ? err.message : String(err);
			throw new Error(`Failed to save snippet file: ${errorMessage}`);
		}
	}

	// Gets snippet by ID by parsing the .rb file
	async getCodeSnippet(id: string): Promise<CodeSnippet> {
		if (!id.startsWith("code_snippet_")) {
			throw new Error(`Invalid snippet ID format: ${id}`);
		}
		const name = id.substring("code_snippet_".length);
		const filePath = this.getSnippetFilePath(name);
		try {
			const content = await fs.readFile(filePath, "utf-8");
			const parsedData = this.parseRbContent(content, filePath);
			return { ...parsedData, filePath }; // Combine parsed data with filePath
		} catch (err) {
			if (err instanceof Error && 'code' in err && err.code === "ENOENT") {
				throw new Error(`Snippet file not found for name "${name}" (ID: ${id}).`);
			}
			// Include original error message for better debugging
			const baseMessage = err instanceof Error ? err.message : String(err);
			console.error(`Failed to read or parse snippet file: ${filePath}`, err);
			throw new Error(`Failed to read/parse snippet ${id}: ${baseMessage}`);
		}
	}

	// Gets all snippets by reading the directory and parsing .rb files
	async getSnippets(): Promise<Map<string, CodeSnippet>> {
		const fileSnippets = new Map<string, CodeSnippet>();
		try {
			const files = await fs.readdir(this.codeSnippetDirectory);
			for (const file of files) {
				if (file.endsWith(".rb") && file.startsWith("code_snippet_")) { // Look for .rb files
					const snippetId = path.parse(file).name;
					try {
						// getCodeSnippet now handles reading and parsing the .rb file
						const snippet = await this.getCodeSnippet(snippetId);
						fileSnippets.set(snippetId, snippet);
					} catch (err) {
						const errorDetails = err instanceof Error ? err.message : String(err);
						console.warn(
							`Skipping invalid or unreadable snippet file: ${file}. Error: ${errorDetails}`,
						);
					}
				}
			}
			return fileSnippets;
		} catch (err) {
			if (err instanceof Error && 'code' in err && err.code === "ENOENT") {
				console.warn(
					`Snippet directory not found or not readable: ${this.codeSnippetDirectory}`,
				);
				return new Map();
			}
			console.error(
				`Failed to read snippets from directory: ${this.codeSnippetDirectory}`,
				err,
			);
			return new Map();
		}
	}
}
