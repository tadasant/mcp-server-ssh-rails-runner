import { CodeSnippetClient } from "../clients/codeSnippetClient.js";

// Define args type directly using an interface
export interface PrepareQueryArgs {
	name: string;
	type: "readOnly" | "mutate";
	code: string;
	description?: string;
}

export const prepareQueryToolDefinition = {
	name: "prepare_query",
	description:
		"Prepares a Rails query by saving it as a local code snippet file and opening it. This allows review before execution. Specify if it's a 'readOnly' or 'mutate' query." +
		(process.env.PROJECT_NAME_AS_CONTEXT
			? ` - used for the project: ${process.env.PROJECT_NAME_AS_CONTEXT}`
			: ""),
	inputSchema: {
		type: "object",
		properties: {
			name: {
				type: "string",
				description:
					"A descriptive name for the query (e.g., 'find_active_users', 'update_user_email'). Used for the filename.",
			},
			type: {
				type: "string",
				enum: ["readOnly", "mutate"],
				description:
					"Specifies whether the query is intended to be read-only or mutative.",
			},
			code: {
				type: "string",
				description: "The Ruby code for the Rails query.",
			},
			description: {
				type: "string",
				description: "An optional description for the query snippet.",
			},
		},
		required: ["name", "type", "code"],
	},
};

export async function prepareQuery(
	args: PrepareQueryArgs,
	codeSnippetClient: CodeSnippetClient,
) {
	// Use the interface directly. MCP framework handles validation based on inputSchema.
	const validatedArgs = args;

	try {
		const { id, filePath } = await codeSnippetClient.createCodeSnippet({
			name: validatedArgs.name,
			code: validatedArgs.code,
			type: validatedArgs.type,
			description: validatedArgs.description,
		});

		// Return the file URI
		return {
			content: [
				{
					type: "text",
					text: `Query prepared successfully. Saved as snippet "${id}" and opened locally.`,
				},
				{
					type: "resource",
					resource: {
						uri: `file://${filePath}`,
						name: `Query: ${validatedArgs.name}`,
						description: validatedArgs.description || `Prepared query: ${id}`,
					},
				},
			],
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error preparing query";
		const finalMessage = errorMessage.includes("already exists")
			? errorMessage
			: `Failed to prepare query: ${errorMessage}`;
		return {
			content: [
				{
					type: "text",
					text: finalMessage,
				},
			],
			error: {
				type: "tool_error",
				message: finalMessage,
			},
		};
	}
} 