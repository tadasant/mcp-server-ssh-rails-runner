import path from "path";
import { CodeSnippetClient } from "../clients/codeSnippetClient.js";

export interface GetCodeSnippetArgs {
	uri: string;
}

export const getCodeSnippetToolDefinition = {
	name: "get_code_snippet",
	description: "Returns a code snippet & its metadata. Useful as a followup to get_all_code_snippets so as to verify that the contents is what you expect.",
	inputSchema: {
		type: "object",
		properties: {
			uri: {
				type: "string",
				description: "The URI (identifier) of the code snippet to retrieve"
			}
		},
		required: ["uri"]
	}
};

export async function getCodeSnippet(
	codeSnippetClient: CodeSnippetClient,
	args: GetCodeSnippetArgs,
) {
  
  const filePath = args.uri.replace("file://", "");
	// Extract ID (code_snippet_<name>) from the filename
	const id = path.parse(filePath).name;

	if (!id || !id.startsWith("code_snippet_")) {
		throw new Error(`Invalid code snippet URI format: ${args.uri}`);
	}

	try {
		const snippet = await codeSnippetClient.getCodeSnippet(id);
		// Return the actual *code* content for review, not the whole snippet JSON
		return {
			content: [
				{
					type: "text",
					text: snippet.code,
				},
			],
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (errorMessage.includes("not found")) { // Simplified check
			return {
				content: [
					{
						type: "text",
						text: `Code snippet not found: ${args.uri}`,
					},
				],
			};
		} else {
			console.error(`Error reading resource ${args.uri}:`, error);
			return {
				content: [
					{
						type: "text",
						text: `Failed to read resource: ${errorMessage}`,
					},
				],
			};
		}
	}
}
