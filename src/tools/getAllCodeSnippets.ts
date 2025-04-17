import { CodeSnippetClient } from "../clients/codeSnippetClient.js";

export const getAllCodeSnippetsToolDefinition = {
	name: "get_all_code_snippets",
	description:
		"Run this BEFORE trying prepare_code_snippet so you know whether there is an existing code snippet you can use. Returns all the available code snippets & their URI's. The model can then choose one if it seems to fit instead of trying to create a new code snippet." +
		(process.env.PROJECT_NAME_AS_CONTEXT
			? ` - used for the project: ${process.env.PROJECT_NAME_AS_CONTEXT}`
			: ""),
	inputSchema: {
		type: "object",
		properties: {}
	}
};

export async function getAllCodeSnippets(
	codeSnippetClient: CodeSnippetClient,
) {
  const snippetsMap = await codeSnippetClient.getSnippets();
	const resources = Array.from(snippetsMap.values()).map((snippet) => ({
		// URI is already file://<path> from client
		uri: `file://${snippet.filePath}`,
		// Use snippet.name which is the user-provided name
		name: `CodeSnippet: ${snippet.name} (${snippet.type})`, // Include type in name
		description: snippet.description,
	}));

	return {
		content: [
			{
        type: "text",
        text: `Available code snippets: ${JSON.stringify(resources)}`,
      }
    ]
  }
} 