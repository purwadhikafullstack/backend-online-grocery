import Module from 'module';
import path from 'path';

type ModuleResolver = (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options?: unknown,
) => string;

const moduleWithResolver = Module as unknown as {
  _resolveFilename: ModuleResolver;
};

const originalResolveFilename = moduleWithResolver._resolveFilename;

moduleWithResolver._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const mappedRequest = path.join(process.cwd(), 'src', request.slice(2));
    return originalResolveFilename.call(this, mappedRequest, parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
