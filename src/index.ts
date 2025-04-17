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
	prepareQuery,
	prepareQueryToolDefinition,
	PrepareQueryArgs,
} from "./tools/prepareQuery.js";
import {
	executeQueryReadOnly,
	executeQueryReadOnlyToolDefinition,
	ExecuteQueryReadOnlyArgs,
} from "./tools/executeQueryReadOnly.js";
import {
	executeQueryMutate,
	executeQueryMutateToolDefinition,
	ExecuteQueryMutateArgs,
} from "./tools/executeQueryMutate.js";

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
		instructions: `This server allows you to prepare and execute Ruby code in a remote Rails environment via SSH using a two-step process:

      1.  **Prepare Query:** Use the 'prepareQuery' tool to draft your Ruby code. Provide a unique 'name' for the query, specify if it's 'readOnly' or 'mutate', and write the 'code'. This saves the query to a local file (which will be opened for review) and returns its file URI.

      2.  **Execute Query:**
          *   For **read-only** queries (verified as 'readOnly' type during preparation), use the 'executeQueryReadOnly' tool, providing the 'uri' from the prepare step. This tool performs an additional safety check to ensure the code looks read-only before running it.
          *   For **mutating** queries (verified as 'mutate' type during preparation), FIRST **confirm with the user** that they have reviewed the code in the opened file and explicitly approve execution. THEN, use the **DANGEROUS** 'executeQueryMutate' tool, providing the 'uri'. This tool executes the code *directly* without further checks.

      **Workflow Summary:**
      - Read-only: prepareQuery(type='readOnly') -> executeQueryReadOnly(uri)
      - Mutate: prepareQuery(type='mutate') -> **USER REVIEW & CONFIRMATION** -> executeQueryMutate(uri)

      Always ensure 'puts' is used in your Ruby code if you want to see the output of the query execution.
      `,
	},
);

// Tool implementations
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		// List new tools
		prepareQueryToolDefinition,
		executeQueryReadOnlyToolDefinition,
		executeQueryMutateToolDefinition,
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	// Handle new tool calls
	switch (name) {
		case prepareQueryToolDefinition.name:
			return prepareQuery(args as unknown as PrepareQueryArgs, codeSnippetClient);

		case executeQueryReadOnlyToolDefinition.name:
			return executeQueryReadOnly(
				args as unknown as ExecuteQueryReadOnlyArgs,
				sshRailsClient,
				codeSnippetClient,
			);

		case executeQueryMutateToolDefinition.name:
			return executeQueryMutate(
				args as unknown as ExecuteQueryMutateArgs,
				sshRailsClient,
				codeSnippetClient,
			);

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
			name: `Query: ${snippet.name} (${snippet.type})`, // Include type in name
			description: snippet.description,
		})),
	};
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
	const filePath = request.params.uri.replace("file://", "");
	// Extract ID (query_<name>) from the filename
	const id = path.parse(filePath).name;

	if (!id || !id.startsWith("query_")) {
		throw new Error(`Invalid query snippet URI format: ${request.params.uri}`);
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
					// Indicate the content is Ruby code
					mimeType: "text/x-ruby", // More specific mime type
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
