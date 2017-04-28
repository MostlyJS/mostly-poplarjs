var _ = require('lodash');
var pathToRegexp = require('path-to-regexp');

/*!
 * Expose sort of useful functions
 */
var Helper = {};

/*!
 * convert obj to string
 */
Helper.obj2str = function(val) {
  return Object.prototype.toString.call(val);
};

/*!
 * check if a value is empty
 */
Helper.isEmpty = function(val) {
  if (val === 0) return true;
  if (Number.isNaN(val)) return true;
  return !_.isNumber(val) && _.isEmpty(val);
};

/*!
 * check if a value is present
 */
Helper.isPresent = function(val) {
  return !Helper.isEmpty(val);
};

/*!
 * excape RegExp string
 */
Helper.escapeRegex = function(d) {
  // see http://stackoverflow.com/a/6969486/69868
  return d.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
};

Helper.decodeParam = function(param) {
  try {
    return decodeURIComponent(param);
  } catch (_) {
    throw createError(400, 'failed to decode param "' + param + '"');
  }
}

Helper.pathMatch = function(path, options) {
  var keys = [];
  var re = pathToRegexp(path, keys, options);

  return [
    re,
    function (pathname, params) {
      var m = re.exec(pathname);
      if (!m) return false;

      params = params || {};

      var key, param;
      for (var i = 0; i < keys.length; i++) {
        key = keys[i];
        param = m[i + 1];
        if (!param) continue;
        params[key.name] = decodeParam(param);
        if (key.repeat) {
          params[key.name] = params[key.name].split(key.delimiter);
        }
      }

      return params;
    }
  ];
};

module.exports = Helper;
