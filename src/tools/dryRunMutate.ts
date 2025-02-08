import { z } from "zod";
import { CodeSnippetClient } from "../clients/codeSnippetClient.js";
import { MutationAnalysisClient } from "../clients/mutationAnalysisClient.js";

const DryRunMutateArgsSchema = z.object({
	mutate_code: z.string().min(1),
	dry_run_code: z.string().min(1),
	description: z.string().min(1),
});

export type DryRunMutateArgs = {
	mutate_code: string;
	dry_run_code: string;
	description: string;
};

export const dryRunMutateToolDefinition = {
	name: "dry_run_mutate",
	description:
		"Plans and validates potential Rails mutations without executing them. Every command is its own isolated session - you cannot use variables across commands." +
		(process.env.PROJECT_NAME_AS_CONTEXT
			? ` - used for the project: ${process.env.PROJECT_NAME_AS_CONTEXT}`
			: ""),
	inputSchema: {
		type: "object",
		properties: {
			mutate_code: {
				type: "string",
				description:
					"The Ruby code to be analyzed for mutation (e.g., 'User.find(1).update(name: \"New Name\")').",
			},
			dry_run_code: {
				type: "string",
				description:
					"A 'dry run' equivalent of the code. For example, if we are updating a specific .where clause with mutate_code, dry_run_code should just read the same .where claude to inform us of what's going to get changed if we run the mutate. Running this should well-inform the user of whether or not they will want to proceed with the mutation.",
			},
			description: {
				type: "string",
				description:
					"A brief description of what this mutation is intended to accomplish",
			},
		},
		required: ["mutate_code", "dry_run_code", "description"],
	},
};

export async function dryRunMutate(
	args: DryRunMutateArgs,
	mutationAnalysisClient: MutationAnalysisClient,
	codeSnippetClient: CodeSnippetClient
) {
	const validatedArgs = DryRunMutateArgsSchema.parse(args);

	try {
		// Create a code snippet resource with a unique ID
		const snippetId = await codeSnippetClient.createCodeSnippet({
			code: validatedArgs.mutate_code,
			description: validatedArgs.description,
			type: "mutation",
		});

		// Analyze the code for safety and potential impacts
		const analysis = await mutationAnalysisClient.analyzeMutation(
			validatedArgs.mutate_code,
			validatedArgs.dry_run_code
		);

		return {
			content: [
				{
					type: "text",
					text: `Mutation Analysis Complete - Snippet ID: ${snippetId}`,
				},
				{
					type: "text",
					text: JSON.stringify({
						snippetId,
						mutate_code: validatedArgs.mutate_code,
						dry_run_code: validatedArgs.dry_run_code,
						description: validatedArgs.description,
						analysis: {
							potentialRisks: analysis.potentialRisks,
							validationStatus: analysis.validationStatus,
							dryRunOutput: analysis.dryRunOutput,
						},
					}),
				},
				{
					type: "text",
					text: "To execute this mutation, use the execute_mutate tool with the provided snippet ID after informing the user of the analysis and getting confirmation that they want to proceed. Please make sure to reformat both the mutate code and the dry run code in a pretty way and present it to the user for review to audit your process.",
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
					text: `Failed to analyze mutation: ${errorMessage}`,
				},
			],
		};
	}
}
