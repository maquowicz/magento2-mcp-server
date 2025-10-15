import fs from 'fs/promises';
import path from 'path';

export function createListResourcesHandler() {
  return async (): Promise<any> => ({
    resources: [
      {
        uri: 'magento://rest/schema',
        name: 'Magento REST API Schema',
        mimeType: "application/json",
      }
    ]
  });
}

export function createReadResourceHandler(url: string, getToken: () => Promise<string>) {
  return async (request: any): Promise<any> => {
    const uri = request.params.uri;

    if (uri === 'magento://rest/schema') {
      const cacheDir = path.join(__dirname, '../..', '.data', 'cache');
      const cacheFile = path.join(cacheDir, 'schema.json');

      console.log('Cache directory:', cacheDir);

      await fs.mkdir(cacheDir, { recursive: true });

      let text: string;

      try {
        await fs.access(cacheFile);
        const cachedData = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
        const now = Date.now();
        if (!('timestamp' in cachedData) || now - cachedData.timestamp > 3600000) { // 1 hour in ms
          throw new Error('Cache expired or invalid format');
        }
        console.log('Schema loaded from cache at:', cacheFile);
        text = JSON.stringify(cachedData.schema, null, 2);
      } catch {
        console.log('Fetching schema from API');
        const token = await getToken();
        const schema = await fetch(`${url}/rest/all/schema?services=all`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const schemaJson = await schema.json();
        const cacheData = { schema: schemaJson, timestamp: Date.now() };
        await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
        console.log('Schema cached to file');
        text = JSON.stringify(schemaJson, null, 2);
      }

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text,
          }
        ]
      };
    }

    throw new Error('Resource not found');
  };
}
