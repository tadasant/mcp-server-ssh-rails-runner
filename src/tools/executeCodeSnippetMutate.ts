import * as path from "path";
import { CodeSnippetClient } from "../clients/codeSnippetClient.js";
import { SSHRailsClient } from "../clients/sshRailsClient.js";

// Define args type directly using an interface
export interface ExecuteCodeSnippetMutateArgs {
	uri: string;
}

export const executeCodeSnippetMutateToolDefinition = {
	name: "execute_code_snippet_mutate",
	description:
		"Executes a previously prepared **mutate** code snippet. Executes the code directly. There is no dry run. Double-check the URI and ensure it points to a snippet marked as 'mutate'." +
		(process.env.PROJECT_NAME_AS_CONTEXT
			? ` - used for the project: ${process.env.PROJECT_NAME_AS_CONTEXT}`
			: ""),
	inputSchema: {
		type: "object",
		properties: {
			uri: {
				type: "string",
				format: "uri",
				description:
					"The file URI (e.g., 'file:///path/to/code_snippet_name.json') of the prepared **mutate** code snippet.",
			},
		},
		required: ["uri"],
	},
};

export async function executeCodeSnippetMutate(
	args: ExecuteCodeSnippetMutateArgs,
	sshRailsClient: SSHRailsClient,
	codeSnippetClient: CodeSnippetClient,
) {
	const validatedArgs = args;
	let snippetId: string | undefined;

	try {
		// 1. Extract ID and get snippet (which includes the filePath)
		const requestedFilePath = validatedArgs.uri.replace("file://", "");
		snippetId = path.parse(requestedFilePath).name;

		if (!snippetId || !snippetId.startsWith("code_snippet_")) {
			throw new Error(`Invalid snippet URI format: ${validatedArgs.uri}`);
		}

		const snippet = await codeSnippetClient.getCodeSnippet(snippetId);

		// Additional check: Ensure the URI provided matches the snippet's actual path
		if (snippet.filePath !== requestedFilePath) {
			console.warn(
				`Provided URI path ${requestedFilePath} does not exactly match snippet path ${snippet.filePath}. Using snippet path.`,
			);
		}

		// 2. Verify snippet type
		if (snippet.type !== "mutate") {
			throw new Error(
				`Cannot execute: Snippet "${snippetId}" is marked as type '${snippet.type}', not 'mutate'. Use the correct execution tool or prepare a new 'mutate' code snippet.`,
			);
		}

		// 3. Execute the mutation using the *original* snippet file path
		console.warn(
			`Executing MUTATION from snippet "${snippetId}" using file ${snippet.filePath}. User confirmation is assumed.`,
		);
		const result = await sshRailsClient.executeMutate(snippet.filePath);

		return {
			content: [
				{
					type: "text",
					text: `Mutation code snippet "${snippetId}" executed successfully.`,
				},
				{
					type: "text",
					text: `Output:\n${String(result)}`,
				},
			],
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error executing mutation";

		return {
			content: [
				{
					type: "text",
					text: `Failed to execute mutation code snippet${snippetId ? ` "${snippetId}"` : ""}: ${errorMessage}`,
				},
			],
			error: {
				type: "tool_error",
				message: `Failed to execute mutation code snippet${snippetId ? ` "${snippetId}"` : ""}: ${errorMessage}`,
			},
		};
	}
} 