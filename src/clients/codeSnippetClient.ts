interface CodeSnippet {
	id: string;
	code: string;
	description: string;
	type: "mutation" | "read_only";
	createdAt: Date;
}

export class CodeSnippetClient {
	private snippets: Map<string, CodeSnippet>;

	constructor() {
		this.snippets = new Map();
	}

	async createCodeSnippet(params: {
		code: string;
		description: string;
		type: "mutation" | "read_only";
	}): Promise<string> {
		const id = `snippet_${Date.now()}_${Math.random()
			.toString(36)
			.slice(2, 11)}`;
		const snippet: CodeSnippet = {
			id,
			...params,
			createdAt: new Date(),
		};

		this.snippets.set(id, snippet);
		return id;
	}

	async getCodeSnippet(snippetId: string): Promise<CodeSnippet> {
		const snippet = this.snippets.get(snippetId);
		if (!snippet) {
			throw new Error(`Snippet not found: ${snippetId}`);
		}
		return snippet;
	}

	getSnippets(): Map<string, CodeSnippet> {
		return this.snippets;
	}
}
