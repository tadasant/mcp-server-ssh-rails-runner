import * as path from "path";
import { CodeSnippetClient } from "../clients/codeSnippetClient.js";
import { SSHRailsClient } from "../clients/sshRailsClient.js";

// Define args type directly using an interface
export interface ExecuteQueryReadOnlyArgs {
	uri: string;
}

export const executeQueryReadOnlyToolDefinition = {
	name: "execute_query_read_only",
	description:
		"Executes a previously prepared read-only Rails query snippet. Verifies read-only status before execution." +
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
					"The file URI (e.g., 'file:///path/to/query_name.json') of the prepared query snippet.",
			},
		},
		required: ["uri"],
	},
};

export async function executeQueryReadOnly(
	args: ExecuteQueryReadOnlyArgs,
	sshRailsClient: SSHRailsClient,
	codeSnippetClient: CodeSnippetClient,
) {
	const validatedArgs = args;
	let snippetId: string | undefined;

	try {
		// 1. Extract ID and get snippet (which includes the filePath)
		const requestedFilePath = validatedArgs.uri.replace("file://", "");
		snippetId = path.parse(requestedFilePath).name;

		if (!snippetId || !snippetId.startsWith("query_")) {
			throw new Error(`Invalid snippet URI format: ${validatedArgs.uri}`);
		}

		const snippet = await codeSnippetClient.getCodeSnippet(snippetId);

		// Additional check: Ensure the URI provided matches the snippet's actual path
		if (snippet.filePath !== requestedFilePath) {
			console.warn(
				`Provided URI path ${requestedFilePath} does not exactly match snippet path ${snippet.filePath}. Using snippet path.`,
			);
			// Potentially throw an error here if strict matching is required, but for now, we'll proceed with the path derived from the ID.
		}

		// 2. Verify snippet type
		if (snippet.type !== "readOnly") {
			throw new Error(
				`Cannot execute: Snippet "${snippetId}" is marked as type '${snippet.type}', not 'readOnly'. Use the correct execution tool.`,
			);
		}

		// 3. Execute the read-only operation using the *original* snippet file path
		const result = await sshRailsClient.executeReadOnly(snippet.filePath);

		return {
			content: [
				{
					type: "text",
					text: `Read-only query snippet "${snippetId}" executed successfully. Make sure to include 'puts' in your query code to see output here.`,
				},
				{
					type: "text",
					text: `Output:\n${String(result)}`,
				},
			],
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error executing query";

		return {
			content: [
				{
					type: "text",
					text: `Failed to execute read-only query${snippetId ? ` "${snippetId}"` : ""}: ${errorMessage}`,
				},
			],
			error: {
				type: "tool_error",
				message: `Failed to execute read-only query${snippetId ? ` "${snippetId}"` : ""}: ${errorMessage}`,
			},
		};
	}
} 