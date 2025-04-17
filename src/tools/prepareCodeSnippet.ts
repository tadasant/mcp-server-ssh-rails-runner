import { CodeSnippetClient } from "../clients/codeSnippetClient.js";

// Define args type directly using an interface
export interface PrepareCodeSnippetArgs {
	name: string;
	type: "readOnly" | "mutate";
	code: string;
	description?: string;
}

export const prepareCodeSnippetToolDefinition = {
	name: "prepare_code_snippet",
	description:
		"Prepares a Rails code snippet by saving it as a local code snippet file and opening it. This allows review before execution. Specify if it's a 'readOnly' or 'mutate' code snippet. Note that you MUST use `puts` to display any output you want to see; the code will be executed via `rails runner exec`, so failure to explicitly print via `puts` will result in no visible output. Even if you are performing a mutation, please use `puts` to give a sense for what successful operations were completed.\n\nBefore using this tool, PLEASE use get_all_code_snippets (followed by get_code_snippet) to check if an existing code snippet might already e`xist to fulfill your request.\n\n" +
		(process.env.PROJECT_NAME_AS_CONTEXT
			? ` - used for the project: ${process.env.PROJECT_NAME_AS_CONTEXT}`
			: ""),
	inputSchema: {
		type: "object",
		properties: {
			name: {
				type: "string",
				description:
					"A descriptive name for the code snippet (e.g., 'find_active_users', 'update_user_email'). Used for the filename.",
			},
			type: {
				type: "string",
				enum: ["readOnly", "mutate"],
				description:
					"Specifies whether the code snippet is intended to be read-only or mutative.",
			},
			code: {
				type: "string",
				description: "The Ruby code for the Rails code snippet.",
			},
			description: {
				type: "string",
				description: "An optional description for the code snippet.",
			},
		},
		required: ["name", "type", "code"],
	},
};

export async function prepareCodeSnippet(
	args: PrepareCodeSnippetArgs,
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
					text: `CodeSnippet prepared successfully. Saved as snippet "${id}" and opened locally. URI is file://${filePath}`,
				}
			],
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error preparing code snippet";
		const finalMessage = errorMessage.includes("already exists")
			? errorMessage
			: `Failed to prepare code snippet: ${errorMessage}`;
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