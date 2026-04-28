import { Core } from '@go-automation/go-common';
import { main } from './main.js';
import { scriptMetadata, scriptParameters } from './config.js';

const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
});

script
  .run(async () => main(script))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
