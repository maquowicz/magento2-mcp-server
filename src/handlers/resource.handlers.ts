import fs from 'fs/promises';
import path from 'path';
import { URL } from 'url';

export function createListResourcesHandler() {
  return async (): Promise<any> => ({
    resources: [
      {
        uri: 'magento://rest/schema',
        name: 'Magento REST API Schema (Searchable)',
        mimeType: "application/json",
        description: "Full Magento REST API schema, or filtered subset via ?search=keyword (multi-word queries use OR logic across words for broader matches, case-insensitive) or ?search=/regex/ (regex, e.g., /customers/i). Searches all string fields (paths, descriptions, etc.) and returns full matching structures to preserve context. For exact paths, use regex with escaped slashes like /V1/eav\/attribute-options/i.",
      }
    ]
  });
}

export function createReadResourceHandler(url: string, getToken: () => Promise<string>) {
  return async (request: any): Promise<any> => {
    const uri = request.params.uri;

    const urlObj = new URL(uri, 'http://dummy');
    const searchQuery = urlObj.searchParams.get('search');

    if (uri.startsWith('magento://rest/schema')) {
      const cacheDir = path.join(__dirname, '../..', '.data', 'cache');
      const cacheFile = path.join(cacheDir, 'schema.json');

      console.log('Cache directory:', cacheDir);

      await fs.mkdir(cacheDir, { recursive: true });

      let schemaJson: any;

      try {
        await fs.access(cacheFile);
        const cachedData = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
        const now = Date.now();
        if (!('timestamp' in cachedData) || now - cachedData.timestamp > 3600000) { // 1 hour in ms
          throw new Error('Cache expired or invalid format');
        }
        console.log('Schema loaded from cache at:', cacheFile);
        schemaJson = cachedData.schema;
      } catch {
        console.log('Fetching schema from API');
        const token = await getToken();
        const response = await fetch(`${url}/rest/all/schema?services=all`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        schemaJson = await response.json();
        const cacheData = { schema: schemaJson, timestamp: Date.now() };
        await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
        console.log('Schema cached to file');
      }

      let text: string;
      if (searchQuery) {
        console.log('Schema search query:', searchQuery);
        const filteredJson = searchSchema(schemaJson, searchQuery);
        text = JSON.stringify(filteredJson || {}, null, 2);
      } else {
        text = JSON.stringify(schemaJson, null, 2);
      }

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text,
            description: searchQuery ? `Filtered Magento REST API schema for query: ${searchQuery}` : 'Full Magento REST API schema'
          }
        ]
      };
    }

    throw new Error('Resource not found');
  };
}

function searchSchema(schema: any, query: string): any {
  if (!schema || typeof schema !== 'object' || !schema.paths || typeof schema.paths !== 'object') {
    return {};
  }

  const queryTrim = query.trim();
  let isRegex = false;
  let regex: RegExp | null = null;
  let keyword: string = '';

  if (queryTrim.startsWith('/')) {
    const lastSlashIndex = queryTrim.lastIndexOf('/');
    if (lastSlashIndex > 0) {
      const pattern = queryTrim.substring(1, lastSlashIndex);
      const flagsStr = queryTrim.substring(lastSlashIndex + 1).trim();
      if (/^[gimyus]*$/.test(flagsStr)) {
        try {
          const flags = flagsStr || 'i';
          regex = new RegExp(pattern, flags);
          isRegex = true;
        } catch (e) {
          console.log('Invalid regex:', e);
          return {};
        }
      } else {
        keyword = queryTrim.toLowerCase();
      }
    } else {
      keyword = queryTrim.toLowerCase();
    }
  } else {
    keyword = queryTrim.toLowerCase();
  }

  const words = keyword.split(/\s+/).filter(w => w.length > 0);

  function checkMatch(value: string): boolean {
    if (isRegex && regex) {
      return regex.test(value);
    } else {
      const lowerValue = value.toLowerCase();
      if (words.length === 0) {
        return false;
      }
      return words.some(word => lowerValue.includes(word.toLowerCase()));
    }
  }

  function filterSchema(obj: any): any | null {
    if (obj == null || typeof obj !== 'object') {
      if (typeof obj === 'string' && checkMatch(obj)) {
        return obj;
      }
      return null;
    }

    const isArray = Array.isArray(obj);
    const result: any = isArray ? [] : {};
    let hasMatch = false;

    if (isArray) {
      obj.forEach((item: any) => {
        const filtered = filterSchema(item);
        if (filtered !== null) {
          result.push(filtered);
          hasMatch = true;
        }
      });
    } else {
      for (const key in obj) {
        const value = obj[key];
        let filteredValue: any = null;
        if (checkMatch(key)) {
          filteredValue = value;
          hasMatch = true;
        } else {
          filteredValue = filterSchema(value);
        }
        if (filteredValue !== null) {
          result[key] = filteredValue;
          hasMatch = true;
        }
      }
    }

    return hasMatch ? result : null;
  }

  const filteredSchema = filterSchema(schema);
  return filteredSchema || {};
}
