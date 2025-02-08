import { z } from "zod";
import { SSHRailsClient } from "../clients/sshRailsClient.js";

const ExecuteReadOnlyArgsSchema = z.object({
	code: z.string().min(1),
});

export type ExecuteReadOnlyArgs = {
	code: string;
};

export const executeReadOnlyToolDefinition = {
	name: "execute_read_only",
	description:
		"Executes read-only Rails console operations safely. Every command is its own isolated session - you cannot use variables across commands." +
		(process.env.PROJECT_NAME_AS_CONTEXT
			? ` - used for the project: ${process.env.PROJECT_NAME_AS_CONTEXT}`
			: ""),
	inputSchema: {
		type: "object",
		properties: {
			code: {
				type: "string",
				description:
					"The Ruby code to execute (must be read-only, e.g., 'User.count' or 'Product.where(active: true).pluck(:name)')",
			},
		},
		required: ["code"],
	},
};

export async function executeReadOnly(
	args: ExecuteReadOnlyArgs,
	sshRailsClient: SSHRailsClient
) {
	const validatedArgs = ExecuteReadOnlyArgsSchema.parse(args);

	try {
		// Verify the code is read-only before execution
		const isReadOnly = await sshRailsClient.verifyReadOnly(validatedArgs.code);
		if (!isReadOnly) {
			throw new Error(
				"The provided code contains potential mutations and cannot be executed in read-only mode"
			);
		}

		// Execute the read-only operation
		const result = await sshRailsClient.executeReadOnly(validatedArgs.code);

		return {
			content: [
				{
					type: "text",
					text: "Read-only operation executed successfully",
				},
				{
					type: "text",
					text: String(result),
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
					text: `Failed to execute read-only operation: ${errorMessage}`,
				},
			],
		};
	}
}
