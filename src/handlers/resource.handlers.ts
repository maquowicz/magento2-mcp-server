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
      const token = await getToken();
      const schema = await fetch(`${url}/rest/all/schema?services=all`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const schemaJson = await schema.json();

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(schemaJson, null, 2),
          }
        ]
      };
    }

    throw new Error('Resource not found');
  };
}
