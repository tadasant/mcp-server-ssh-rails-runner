import { z } from "zod";
import { SSHRailsClient } from "../clients/sshRailsClient.js";
import { CodeSnippetClient } from "../clients/codeSnippetClient.js";

const ExecuteMutateArgsSchema = z.object({
	snippetId: z.string().min(1),
});

export type ExecuteMutateArgs = {
	snippetId: string;
};

export const executeMutateToolDefinition = {
	name: "execute_mutate",
	description:
		"Executes a previously validated Rails mutation using its snippet ID" +
		(process.env.PROJECT_NAME_AS_CONTEXT
			? ` - used for the project: ${process.env.PROJECT_NAME_AS_CONTEXT}`
			: ""),
	inputSchema: {
		type: "object",
		properties: {
			snippetId: {
				type: "string",
				description:
					"The ID of the previously validated mutation snippet to execute",
			},
		},
		required: ["snippetId"],
	},
};

export async function executeMutate(
	args: ExecuteMutateArgs,
	sshRailsClient: SSHRailsClient,
	codeSnippetClient: CodeSnippetClient
) {
	const validatedArgs = ExecuteMutateArgsSchema.parse(args);

	try {
		// Retrieve and verify the snippet exists
		const snippet = await codeSnippetClient.getCodeSnippet(
			validatedArgs.snippetId
		);

		// Execute the mutation
		const result = await sshRailsClient.execute(snippet.code);

		return {
			content: [
				{
					type: "text",
					text: `Mutation executed successfully - Snippet ID: ${validatedArgs.snippetId}`,
				},
				{
					type: "text",
					text: JSON.stringify({
						snippetId: validatedArgs.snippetId,
						executionResult: result,
						timestamp: new Date().toISOString(),
					}),
				},
			],
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		return {
			content: [
				{
					type: "text",
					text: `Failed to execute mutation: ${errorMessage}`,
				},
			],
		};
	}
}
