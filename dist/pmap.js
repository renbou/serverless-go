"use strict";
// Wrapper around "p-map" ES Module allowing integration in CommonJS
// We currently need this since Serverless Framework is still CommonJS
let pMapModule = null;
async function pMap(input, mapper, options) {
    if (pMapModule === null) {
        pMapModule = (await eval('import("p-map")')).default;
    }
    return pMapModule(input, mapper, options);
}
module.exports = pMap;
