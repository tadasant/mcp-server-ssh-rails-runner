import { SSHRailsClient } from "./sshRailsClient.js";

export interface MutationAnalysis {
	validationStatus: "valid" | "invalid" | "warning";
	potentialRisks: string[];
	dryRunOutput: string;
}

export class MutationAnalysisClient {
	constructor(private sshRailsClient: SSHRailsClient) {}

	async analyzeMutation(
		mutateCode: string,
		dryRunCode: string
	): Promise<MutationAnalysis> {
		const dryRunResult = await this.sshRailsClient.execute(dryRunCode);

		return {
			validationStatus: this.validateMutation(mutateCode),
			potentialRisks: this.analyzePotentialRisks(mutateCode),
			dryRunOutput: dryRunResult,
		};
	}

	private analyzePotentialRisks(code: string): string[] {
		const risks: string[] = [];

		// if (code.toLowerCase().includes("delete")) {
		// 	risks.push("Data deletion risk");
		// }
		// if (code.toLowerCase().includes("update all")) {
		// 	risks.push("Mass update risk");
		// }
		// Add more risk analysis as needed

		return risks;
	}

	private validateMutation(code: string): "valid" | "invalid" | "warning" {
		// Implement validation logic
		// This is a simplified example
		if (code.toLowerCase().includes("drop table")) {
			return "invalid";
		}
		if (code.toLowerCase().includes("delete_all")) {
			return "warning";
		}
		return "valid";
	}
}
