import { GOScript } from '@go-automation/go-script';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

const script = new GOScript({ metadata: scriptMetadata, config: { parameters: scriptParameters } });

script.run(async () => await main(script)).catch(() => process.exit(1));
