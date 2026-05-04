import { Core } from '@go-automation/go-common';
import { main } from './main.js';
import { scriptMetadata, scriptParameters } from './config.js';

const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
});

await script.run(async () => {
  await main(script);
});
