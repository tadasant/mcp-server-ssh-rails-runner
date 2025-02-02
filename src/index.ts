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
import {
	dryRunMutate,
	executeMutate,
	executeReadOnly,
	dryRunMutateToolDefinition,
	executeMutateToolDefinition,
	executeReadOnlyToolDefinition,
	ExecuteReadOnlyArgs,
	DryRunMutateArgs,
	ExecuteMutateArgs,
} from "./tools/index.js";
import dotenv from "dotenv";
import { MutationAnalysisClient } from "./clients/mutationAnalysisClient.js";

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
	})
	.parse(process.env);

// Initialize SSH client
const sshRailsClient = new SSHRailsClient();
const codeSnippetClient = new CodeSnippetClient();
const mutationAnalysisClient = new MutationAnalysisClient(sshRailsClient);

// Initialize server
const server = new Server(
	{
		name: "ssh-rails-runner",
		version: "1.0.0",
	},
	{
		capabilities: {
			tools: {},
			resources: {},
		},
	}
);

// Tool implementations
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		executeReadOnlyToolDefinition,
		dryRunMutateToolDefinition,
		executeMutateToolDefinition,
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	switch (name) {
		case executeReadOnlyToolDefinition.name:
			return executeReadOnly(args as ExecuteReadOnlyArgs, sshRailsClient);

		case dryRunMutateToolDefinition.name:
			return dryRunMutate(
				args as DryRunMutateArgs,
				mutationAnalysisClient,
				codeSnippetClient
			);

		case executeMutateToolDefinition.name:
			return executeMutate(
				args as ExecuteMutateArgs,
				sshRailsClient,
				codeSnippetClient
			);

		default:
			throw new Error(`Unknown tool: ${name}`);
	}
});

// Resource handlers for code snippets
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
	resources: Array.from(codeSnippetClient.getSnippets()).map(
		([id, snippet]) => ({
			uri: `snippet://${id}`,
			name: `Code Snippet ${id}`,
			mimeType: "text/plain",
			description: snippet.description,
		})
	),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
	const id = request.params.uri.replace("snippet://", "");
	try {
		const snippet = await codeSnippetClient.getCodeSnippet(id);
		return {
			contents: [
				{
					uri: request.params.uri,
					text: snippet.code,
					mimeType: "text/plain",
				},
			],
		};
	} catch (error) {
		throw new Error(`Resource not found: ${request.params.uri}`);
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
		console.error("SSH Rails Runner MCP Server running");
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
}

main();
