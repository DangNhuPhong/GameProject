import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve against this module, so starting from the repository root also works.
// Render-provided environment variables keep priority over the local file.
dotenv.config({path:fileURLToPath(new URL('../../.env',import.meta.url))});
