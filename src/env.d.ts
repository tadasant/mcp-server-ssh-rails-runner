declare global {
	namespace NodeJS {
		interface ProcessEnv {
			SSH_HOST: string;
			SSH_USER: string;
			SSH_PRIVATE_KEY_PATH: string;
			RAILS_WORKING_DIR: string;
			PROJECT_NAME_AS_CONTEXT?: string;
		}
	}
}

export {};
