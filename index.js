require = require("esm")(module/*, options*/);
console.time('mostly-poplarjs import');
module.exports = require('./src/poplar').default;
module.exports.ApiBuilder = require('./src/api_builder').default;
module.exports.ApiMethod = require('./src/api_method').default;
module.exports.Validate = require('./src/validation').default;
module.exports.Sanitize = require('./src/sanitizer').default;
console.timeEnd('mostly-poplarjs import');
