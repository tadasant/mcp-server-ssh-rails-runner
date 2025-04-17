import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ReadResourceRequestSchema,
	ListResourcesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SSHRailsClient } from "./clients/sshRailsClient.js";
import { CodeSnippetClient } from "./clients/codeSnippetClient.js";
import dotenv from "dotenv";
import path from "path";

// Import new tools and definitions
import {
	prepareCodeSnippet,
	prepareCodeSnippetToolDefinition,
	PrepareCodeSnippetArgs,
} from "./tools/prepareCodeSnippet.js";
import {
	executeCodeSnippetReadOnly,
	executeCodeSnippetReadOnlyToolDefinition,
	ExecuteCodeSnippetReadOnlyArgs,
} from "./tools/executeCodeSnippetReadOnly.js";
import {
	executeCodeSnippetMutate,
	executeCodeSnippetMutateToolDefinition,
	ExecuteCodeSnippetMutateArgs,
} from "./tools/executeCodeSnippetMutate.js";
import {
	getAllCodeSnippets,
	getAllCodeSnippetsToolDefinition,
} from "./tools/getAllCodeSnippets.js";
import {
	getCodeSnippet,
	getCodeSnippetToolDefinition,
	GetCodeSnippetArgs,
} from "./tools/getCodeSnippet.js";

// Load environment variables
dotenv.config();

// Environment validation
const envVars = z
	.object({
		SSH_HOST: z.string(),
		SSH_USER: z.string(),
		SSH_PRIVATE_KEY_PATH: z.string(),
		RAILS_WORKING_DIR: z.string(),
		PROJECT_NAME_AS_CONTEXT: z.string().optional(),
		CODE_SNIPPET_FILE_DIRECTORY: z.string().optional(),
	})
	.parse(process.env);

// Initialize clients
const sshRailsClient = new SSHRailsClient();
const codeSnippetClient = new CodeSnippetClient(
	envVars.CODE_SNIPPET_FILE_DIRECTORY,
);
// Removed: const mutationAnalysisClient = new MutationAnalysisClient(sshRailsClient);

// Initialize server
const server = new Server(
	{
		name: "ssh-rails-runner",
		version: "0.2.0", // Bump version for new workflow
	},
	{
		capabilities: {
			tools: {},
			resources: {},
		},
		// Updated instructions for the new workflow
		instructions: `This server allows you to prepare and execute Ruby code in a remote Rails environment via SSH using a four-step process:
    
      1. **Get All Code Snippets:** Use the 'getAllCodeSnippets' tool to get a list of all the available code snippets that may already exist to fulfill your request.
      
      2. **Get Code Snippet:** If any of the available code snippets seems promising, use 'getCodeSnippet' to get the code snippet & its metadata so you can confirm whether you want to use it.

      3.  **Prepare CodeSnippet:** If you haven't found an appropriate pre-existing code snippet, use the 'prepareCodeSnippet' tool to draft your Ruby code. Provide a unique 'name' for the code snippet, specify if it's 'readOnly' or 'mutate', and write the 'code'. This saves the code snippet to a local file and returns its file URI.

      4.  **Execute CodeSnippet:**
          *   For **read-only** queries (verified as 'readOnly' type during preparation), use the 'executeCodeSnippetReadOnly' tool, providing the 'uri' from the prepare step. This tool performs an additional safety check to ensure the code looks read-only before running it.
          *   For **mutating** queries (verified as 'mutate' type during preparation), FIRST **confirm with the user** that they have reviewed the code in the opened file and explicitly approve execution. THEN, use the **DANGEROUS** 'executeCodeSnippetMutate' tool, providing the 'uri'. This tool executes the code *directly* without further checks.

      Always ensure 'puts' is used in your Ruby code if you want to see the output of the code snippet execution.
      `,
	},
);

// Tool implementations
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		// List new tools
		prepareCodeSnippetToolDefinition,
		executeCodeSnippetReadOnlyToolDefinition,
		executeCodeSnippetMutateToolDefinition,
		getAllCodeSnippetsToolDefinition,
		getCodeSnippetToolDefinition,
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	// Handle new tool calls
	switch (name) {
		case prepareCodeSnippetToolDefinition.name:
			return prepareCodeSnippet(args as unknown as PrepareCodeSnippetArgs, codeSnippetClient);

		case executeCodeSnippetReadOnlyToolDefinition.name:
			return executeCodeSnippetReadOnly(
				args as unknown as ExecuteCodeSnippetReadOnlyArgs,
				sshRailsClient,
				codeSnippetClient,
			);

		case executeCodeSnippetMutateToolDefinition.name:
			return executeCodeSnippetMutate(
				args as unknown as ExecuteCodeSnippetMutateArgs,
				sshRailsClient,
				codeSnippetClient,
			);

		case getAllCodeSnippetsToolDefinition.name:
			return getAllCodeSnippets(codeSnippetClient);

		case getCodeSnippetToolDefinition.name:
			return getCodeSnippet(codeSnippetClient, args as unknown as GetCodeSnippetArgs);

		default:
			throw new Error(`Unknown tool: ${name}`);
	}
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
	const snippetsMap = await codeSnippetClient.getSnippets();
	return {
		resources: Array.from(snippetsMap.values()).map((snippet) => ({
			// URI is already file://<path> from client
			uri: `file://${snippet.filePath}`,
			// Use snippet.name which is the user-provided name
			name: `CodeSnippet: ${snippet.name} (${snippet.type})`, // Include type in name
			description: snippet.description,
		})),
	};
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
	const filePath = request.params.uri.replace("file://", "");
	// Extract ID (code_snippet_<name>) from the filename
	const id = path.parse(filePath).name;

	if (!id || !id.startsWith("code_snippet_")) {
		throw new Error(`Invalid code snippet URI format: ${request.params.uri}`);
	}

	try {
		const snippet = await codeSnippetClient.getCodeSnippet(id);
		// Return the actual *code* content for review, not the whole snippet JSON
		return {
			contents: [
				{
					uri: request.params.uri,
					// Return the Ruby code string
					text: snippet.code,
				},
			],
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (errorMessage.includes("not found")) { // Simplified check
			throw new Error(`Resource not found: ${request.params.uri}`);
		} else {
			console.error(`Error reading resource ${request.params.uri}:`, error);
			throw new Error(`Failed to read resource: ${errorMessage}`);
		}
	}
});

// Start server
async function main() {
	try {
		await sshRailsClient.connect({
			host: envVars.SSH_HOST,
			username: envVars.SSH_USER,
			privateKeyPath: envVars.SSH_PRIVATE_KEY_PATH,
			workingDir: envVars.RAILS_WORKING_DIR,
		});
		const transport = new StdioServerTransport();
		await server.connect(transport);
		console.error("SSH Rails Runner MCP Server (v0.2.0) running"); // Updated log
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
}

main();
