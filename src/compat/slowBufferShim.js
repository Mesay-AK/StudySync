// `jsonwebtoken` depends (via jwa) on the long-unmaintained
// `buffer-equal-constant-time` package, which crashes at import time on Node
// versions that removed the legacy `Buffer.SlowBuffer` alias. Nothing in our
// JWT signing path actually exercises the code that would use it - this only
// keeps that module's own top-level reference from throwing.
//
// Must be the FIRST import in index.js: ES modules evaluate all of a
// sibling import's subgraph before moving to the next import statement, so
// this needs to run before anything that transitively requires
// jsonwebtoken (auth routes, socket auth middleware, etc.) is loaded.
import bufferModule from 'node:buffer';

if (!bufferModule.SlowBuffer) {
  bufferModule.SlowBuffer = Buffer;
}
