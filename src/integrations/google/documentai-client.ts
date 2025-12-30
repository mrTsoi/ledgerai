export async function createDocumentAIClient(config?: any) {
  const mod = await import('@google-cloud/documentai')
  const Client = (mod as any).DocumentProcessorServiceClient ?? mod.DocumentProcessorServiceClient
  return new Client(config)
}

export async function getDocumentAIClasses() {
  const mod = await import('@google-cloud/documentai')
  return mod
}
